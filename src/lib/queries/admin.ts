import "server-only";

import { createClient } from "@/lib/supabase/server";
import { money, type Money } from "@/lib/money";
import type { PageRequest } from "@/lib/pagination";
import type {
  ApprovalRow,
  ClientProjectRow,
  ClientRequestRow,
  ClientRow,
  ProjectPhaseRow,
  RequirementRow,
  StaffRow,
  ServiceMasterRow,
  TaskRow,
} from "@/types/database";

/**
 * Everything the panel reads.
 *
 * All through the session client, so `is_staff()` in the policies is what opens
 * the door rather than a service-role key. An employee made inactive stops
 * seeing client data on their next request without a line of this changing.
 */

/* -------------------------------------------------------------------------- */
/* Clients                                                                     */
/* -------------------------------------------------------------------------- */

export interface ClientSummary extends ClientRow {
  projectCount: number;
}

/**
 * Clients, a page at a time.
 *
 * ---------------------------------------------------------------------------
 * **The count comes back with the rows**, from one request. Supabase's
 * `{ count: "exact" }` runs the count against the same filter as the select,
 * so the total can never describe a different set from the rows beside it —
 * which is what a second, separately-written count query eventually does.
 *
 * **Only the page's own projects are counted.** The old version read every
 * project row in the database to count them per client; on a page of
 * twenty-five that is a table scan to draw twenty-five numbers.
 *
 * `page` is optional so the callers that want the whole list — a select, an
 * export — keep working unchanged.
 */
export async function getClients(
  request?: PageRequest,
): Promise<{ rows: ClientSummary[]; total: number | null }> {
  const supabase = await createClient();

  let query = supabase
    .from("clients")
    .select("*", { count: "exact" })
    .order("name");

  if (request) query = query.range(request.from, request.to);

  const { data: clients, count } = await query;

  const { data: projects } = await supabase
    .from("client_projects")
    .select("client_id")
    .is("archived_at", null)
    /* Only for the clients on this page. `in` with an empty list matches
       nothing, which is right — an empty page has nothing to count. */
    .in("client_id", (clients ?? []).map((row) => row.id));

  const counts = new Map<string, number>();
  for (const row of projects ?? []) {
    counts.set(row.client_id, (counts.get(row.client_id) ?? 0) + 1);
  }

  return {
    rows: (clients ?? []).map((client) => ({
      ...client,
      projectCount: counts.get(client.id) ?? 0,
    })),
    total: count ?? null,
  };
}

export async function getClient(id: string): Promise<ClientRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  return data;
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                    */
/* -------------------------------------------------------------------------- */

export interface ProjectSummary extends ClientProjectRow {
  client: { id: string; name: string; company_name: string | null } | null;
}

/**
 * Live projects, newest first, a page at a time.
 *
 * The count comes back with the rows from one request, so it can never
 * describe a different set from the rows beside it — which is what a
 * separately-written count query eventually does.
 *
 * `request` is optional: callers that want the whole list keep working.
 */
export async function getProjects(
  request?: PageRequest,
): Promise<{ rows: ProjectSummary[]; total: number | null }> {
  const supabase = await createClient();

  let builder = supabase
    .from("client_projects")
    .select("*, client:clients(id, name, company_name)", { count: "exact" })
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (request) builder = builder.range(request.from, request.to);

  const { data, error, count } = await builder;

  if (error) {
    console.error("[admin] projects failed:", error.message);
    return { rows: [], total: null };
  }

  return { rows: (data ?? []) as unknown as ProjectSummary[], total: count ?? null };
}

/**
 * One project, and everything hanging off it.
 *
 * Gathered in one function because the project screen shows all of it, and a
 * screen that assembles its own reads drifts from the next screen that needs
 * the same thing. The money is computed here rather than in the page for the
 * same reason: one answer, in one place.
 */
export interface ProjectDetail {
  project: ProjectSummary;
  phases: ProjectPhaseRow[];
  requirements: RequirementRow[];
  tasks: TaskRow[];
  approvals: ApprovalRow[];
  requests: ClientRequestRow[];
  payments: { id: string; amount: number; paid_on: string; method: string; reference: string | null; note: string | null }[];
  money: Money;
  leadDeveloper: StaffRow | null;
  /** Attached files, newest first, with the uploader's name resolved. */
  files: {
    id: string;
    filename: string;
    mime_type: string | null;
    size_bytes: number | null;
    category: string;
    is_client_visible: boolean;
    created_at: string;
    uploaded_by_name: string | null;
  }[];
}

export async function getProjectDetail(slug: string): Promise<ProjectDetail | null> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("client_projects")
    .select("*, client:clients(id, name, company_name)")
    .eq("slug", slug)
    .maybeSingle();

  if (!project) return null;

  const id = (project as unknown as ProjectSummary).id;

  const [phases, requirements, tasks, approvals, requests, payments, lead, files] =
    await Promise.all([
    supabase.from("project_phases").select("*").eq("project_id", id).order("sort_order"),
    supabase.from("requirements").select("*").eq("project_id", id).order("sort_order"),
    supabase.from("tasks").select("*").eq("project_id", id).order("sort_order"),
    supabase.from("approvals").select("*").eq("project_id", id).order("requested_at", { ascending: false }),
    supabase.from("client_requests").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("payments").select("*").eq("project_id", id).order("paid_on", { ascending: false }),
    (project as unknown as ClientProjectRow).lead_developer_id
      ? supabase.from("staff").select("*").eq("id", (project as unknown as ClientProjectRow).lead_developer_id!).maybeSingle()
      : Promise.resolve({ data: null }),
    /* Newest first: the file somebody wants is almost always the one just
       uploaded, and the contract is found by name whenever it is not. */
    supabase
      .from("project_files")
      .select("*, uploader:staff(full_name)")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const typed = project as unknown as ProjectSummary;

  return {
    files: ((files.data ?? []) as unknown as {
      id: string;
      filename: string;
      mime_type: string | null;
      size_bytes: number | null;
      category: string;
      is_client_visible: boolean;
      created_at: string;
      uploader: { full_name: string } | null;
    }[]).map((row) => ({
      id: row.id,
      filename: row.filename,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      category: row.category,
      is_client_visible: row.is_client_visible,
      created_at: row.created_at,
      uploaded_by_name: row.uploader?.full_name ?? null,
    })),
    project: typed,
    phases: phases.data ?? [],
    requirements: requirements.data ?? [],
    tasks: tasks.data ?? [],
    approvals: approvals.data ?? [],
    requests: requests.data ?? [],
    payments: (payments.data ?? []) as ProjectDetail["payments"],
    money: money(typed.contract_value, typed.discount_amount, payments.data ?? []),
    leadDeveloper: (lead.data as StaffRow | null) ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Work                                                                        */
/* -------------------------------------------------------------------------- */

export interface BoardTask extends TaskRow {
  project: { name: string; slug: string } | null;
}

export async function getMyTasks(staffId: string): Promise<BoardTask[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("tasks")
    .select("*, project:client_projects(name, slug)")
    .eq("assignee_id", staffId)
    .neq("status", "cancelled")
    .order("sort_order");

  return (data ?? []) as unknown as BoardTask[];
}

export async function getUnassignedTasks(): Promise<BoardTask[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("tasks")
    .select("*, project:client_projects(name, slug)")
    .is("assignee_id", null)
    .in("status", ["todo", "in_progress", "in_review", "blocked"])
    .order("sort_order");

  return (data ?? []) as unknown as BoardTask[];
}

export interface RequestWithProject extends ClientRequestRow {
  project: { name: string; slug: string } | null;
  /** Days waiting, worked out here — `Date.now()` in a component is impure. */
  waitingDays: number;
}

/**
 * Requests still waiting on an answer, oldest first.
 *
 * Paged for consistency with every other list, though a queue that needs a
 * second page is itself the news — twenty-five unanswered requests is a
 * backlog, not a screen problem.
 */
export async function getOpenRequests(
  request?: PageRequest,
): Promise<{ rows: RequestWithProject[]; total: number | null }> {
  const supabase = await createClient();

  let builder = supabase
    .from("client_requests")
    .select("*, project:client_projects(name, slug)", { count: "exact" })
    .in("status", ["submitted", "under_review"])
    .order("created_at");

  if (request) builder = builder.range(request.from, request.to);

  const { data, count } = await builder;

  const now = Date.now();

  return {
    rows: (data ?? []).map((row) => ({
      ...row,
      waitingDays: Math.floor(
        (now - new Date(row.created_at as string).getTime()) / 86_400_000,
      ),
    })) as unknown as RequestWithProject[],
    total: count ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Team                                                                        */
/* -------------------------------------------------------------------------- */

export async function getStaff(): Promise<StaffRow[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("staff")
    .select("*")
    .order("is_active", { ascending: false })
    .order("full_name");

  return data ?? [];
}

/** Active staff only, for the "who is building this" pickers. */
export async function getActiveStaff(): Promise<StaffRow[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("staff")
    .select("*")
    .eq("is_active", true)
    .order("full_name");

  return data ?? [];
}

/**
 * The people at one client who can sign in.
 *
 * Inactive ones are included and marked rather than filtered out here: somebody
 * whose access ended is still the author of comments and approvals, and a screen
 * that hides them makes those records look anonymous.
 */
export async function getContacts(clientId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_users")
    .select("id, full_name, email, role, is_active, accepted_at, created_at")
    .eq("client_id", clientId)
    .order("created_at");

  if (error) {
    console.error("[clients] contacts failed:", error.message);
    return [];
  }

  return data ?? [];
}

/**
 * The project's own conversation, oldest first.
 *
 * The newest twenty, handed back in reading order. A conversation is read from
 * the end, and history that has to be scrolled past to reach today is a screen
 * people stop opening.
 */
export async function getProjectMessages(projectId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_messages")
    .select("id, author_name, body, is_internal, created_at, client_user_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[projects] messages failed:", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => ({
      id: row.id,
      author_name: row.author_name,
      body: row.body,
      is_internal: row.is_internal,
      created_at: row.created_at,
      from_client: row.client_user_id !== null,
    }))
    .reverse();
}

/**
 * The service catalogue, for choosing what a project includes.
 *
 * Read from `portal.services_master` — a one-directional view onto
 * `company.services`, which is the same list a client reads on the public site.
 * Copying the catalogue into this schema would be a second one kept in step by
 * remembering to, and this estate has enough of those.
 *
 * Only what is published is offered. A draft service is one we have not decided
 * how to sell yet, and putting it on a client's project is deciding.
 */
export async function getServiceOptions(): Promise<ServiceMasterRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("services_master")
    .select("slug, name, short_name, summary, sort_order, is_offered")
    .eq("is_offered", true)
    .order("sort_order", { ascending: true });

  if (error) {
    // Not thrown. A project form that cannot list services should still save
    // everything else about the project.
    console.error("[services] catalogue unavailable:", error.message);
    return [];
  }

  return (data ?? []) as ServiceMasterRow[];
}

/**
 * Who is on a project, as staff ids.
 *
 * Membership is not decoration: `scope_is_complete()` calls a project
 * delivered when nobody on it is still unfinished, so this table decides when
 * a project can be closed and when a change starts counting against the
 * allowance. Nothing in the application wrote it until 2026-09-01 — rows
 * arrived by hand, or did not arrive.
 */
export async function getProjectMemberIds(projectId: string): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_members")
    .select("staff_id")
    .eq("project_id", projectId);

  if (error) {
    console.error("[projects] members read failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => row.staff_id);
}
