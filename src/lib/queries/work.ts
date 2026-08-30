import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ClientProjectRow,
  ClientRequestRow,
  ProjectPhaseRow,
  StaffRow,
  TaskRow,
} from "@/types/database";

/**
 * What the team sees.
 *
 * Read through the session client like everything else, so `is_staff()` in the
 * policies is what grants the wider view rather than a service-role key. That
 * matters: an employee who is made inactive stops seeing client data on their
 * next request, without anything in this file changing.
 */

export interface BoardTask extends TaskRow {
  project: { name: string; slug: string } | null;
}

/**
 * One person's work, across every project.
 *
 * The default board is "mine", not "everything". A tracker that opens on every
 * task in the company is one a developer has to filter before it is useful, and
 * a board people filter every morning is a board they stop opening.
 *
 * Cancelled tasks are left out. Done ones are kept, because seeing what was
 * finished is half of what a board is for.
 */
export async function getMyBoard(staffId: string): Promise<BoardTask[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*, project:client_projects(name, slug)")
    .eq("assignee_id", staffId)
    .neq("status", "cancelled")
    .order("priority", { ascending: false })
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[work] board failed:", error.message);
    return [];
  }

  return (data ?? []) as unknown as BoardTask[];
}

/** Everything unassigned, so work does not sit in a queue nobody owns. */
export async function getUnassigned(): Promise<BoardTask[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("tasks")
    .select("*, project:client_projects(name, slug)")
    .is("assignee_id", null)
    .in("status", ["todo", "in_progress", "in_review", "blocked"])
    .order("priority", { ascending: false });

  return (data ?? []) as unknown as BoardTask[];
}

export interface ProjectWithClient extends ClientProjectRow {
  client: { name: string; company_name: string | null } | null;
}

export async function getAllProjects(): Promise<ProjectWithClient[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_projects")
    .select("*, client:clients(name, company_name)")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[work] projects failed:", error.message);
    return [];
  }

  return (data ?? []) as unknown as ProjectWithClient[];
}

export async function getProjectForWork(slug: string): Promise<ProjectWithClient | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("client_projects")
    .select("*, client:clients(name, company_name)")
    .eq("slug", slug)
    .maybeSingle();

  return (data as unknown as ProjectWithClient) ?? null;
}

/** Every task on a project, internal ones included. */
export async function getAllTasks(projectId: string): Promise<TaskRow[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  return data ?? [];
}

export async function getProjectPhases(projectId: string): Promise<ProjectPhaseRow[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("project_phases")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  return data ?? [];
}

export interface RequestWithProject extends ClientRequestRow {
  project: { name: string; slug: string } | null;
  /**
   * How long this has been waiting, in whole days.
   *
   * Worked out here rather than in the page. `Date.now()` inside a component is
   * an impure call during render — the React compiler rules refuse it, and they
   * are right to: the same render would produce a different number depending on
   * when it happened to run. A query is the correct place for "as of now".
   */
  waitingDays: number;
}

/**
 * The triage queue.
 *
 * Open ones first and by age, because the oldest unanswered request is the one
 * doing the damage: the client has been waiting longest and has heard nothing.
 */
export async function getOpenRequests(): Promise<RequestWithProject[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_requests")
    .select("*, project:client_projects(name, slug)")
    .in("status", ["submitted", "under_review"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[work] requests failed:", error.message);
    return [];
  }

  const now = Date.now();

  return (data ?? []).map((row) => ({
    ...row,
    waitingDays: Math.floor(
      (now - new Date(row.created_at as string).getTime()) / 86_400_000,
    ),
  })) as unknown as RequestWithProject[];
}

/** The team, for assigning work. */
export async function getStaff(): Promise<StaffRow[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("staff")
    .select("*")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  return data ?? [];
}
