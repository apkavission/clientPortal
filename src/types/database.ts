/**
 * The `portal` schema, as TypeScript.
 *
 * **Hand-written, and provisional.** These types are normally generated with
 * `supabase gen types`, which reads the live database — and the migrations in
 * `supabase/migrations/` have not been run yet, because by this project's
 * convention the owner runs them in the Supabase SQL editor. Generating against
 * a schema that does not exist produces an empty file.
 *
 * So this is written by hand from those same migrations, and it is the one file
 * here that can silently disagree with the database. **Regenerate it the moment
 * the migrations have been run**, and treat any difference as a bug in this
 * file rather than in the SQL:
 *
 *     npx supabase gen types typescript --schema portal > src/types/database.ts
 *
 * Written narrowly on purpose: `Row`, `Insert` and `Update` for the tables this
 * application actually queries. A generated file will be wider, which is fine —
 * nothing here depends on it being minimal.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProjectStage =
  | "discovery"
  | "design"
  | "development"
  | "testing"
  | "launch"
  | "support"
  | "on_hold"
  | "closed";

export type PhaseStatus = "not_started" | "in_progress" | "blocked" | "done";

export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done"
  | "cancelled";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type RequestStatus =
  | "submitted"
  | "under_review"
  | "accepted"
  | "declined"
  | "converted";

export type Health = "on_track" | "at_risk" | "delayed";
export type StaffRole = "owner" | "manager" | "developer" | "designer" | "qa";
export type ClientUserRole = "primary" | "member" | "viewer";
export type MemberRole = "lead" | "developer" | "designer" | "qa" | "manager";
export type RequirementSource = "contract" | "client_request" | "internal";
export type RequirementStatus =
  | "agreed"
  | "in_progress"
  | "delivered"
  | "accepted"
  | "dropped";
export type ApprovalStatus = "pending" | "approved" | "changes_requested";
export type FileCategory = "document" | "design" | "deliverable" | "reference";
export type ActorType = "team" | "client" | "system";
export type ClientStatus = "prospect" | "active" | "paused" | "closed";

/**
 * Written as type aliases, not interfaces, and that is load-bearing.
 *
 * An interface does not get an implicit index signature, so it does not satisfy
 * the `Record<string, unknown>` constraint supabase-js puts on every table. The
 * first version of this file used interfaces: the constraint failed, the whole
 * schema resolved to `never`, and every query in the application reported that
 * its own columns did not exist. The types were right and the shape was wrong.
 */
type Timestamps = {
  created_at: string;
  updated_at: string;
}

export type StaffRow = Timestamps & {
  id: string;
  auth_user_id: string;
  full_name: string;
  email: string | null;
  role: StaffRole;
  is_active: boolean;

  /** Screens beyond this person's role default IN THIS PANEL. See lib/auth/menu.ts. */
  menu_extra: string[];
  /** Screens taken away from it. Wins over menu_extra. */
  menu_denied: string[];

  /* The task tracker's own pair. Separate columns on purpose: the two
     applications have different screens, and one pair holding both sets would
     mean a key granted in one silently appearing in the other. Added by
     20260830000013_tracker_menus.sql. */
  tracker_menu_extra: string[];
  tracker_menu_denied: string[];

  /** A key in company.roles — the master list, edited in the company website.
      Supersedes `role`, which is kept until everything reads the master. */
  role_key: string | null;
}

export type ClientRow = Timestamps & {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  gst: string | null;
  address: string | null;
  status: ClientStatus;
  notes: string | null;
  lead_id: string | null;
}

export type ClientUserRow = Timestamps & {
  id: string;
  client_id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  role: ClientUserRole;
  is_active: boolean;
  invited_at: string;
  accepted_at: string | null;
}

export type ClientProjectRow = Timestamps & {
  id: string;
  client_id: string;
  name: string;
  slug: string;
  summary: string | null;
  stage: ProjectStage;
  health: Health;
  start_date: string | null;
  target_date: string | null;
  actual_end_date: string | null;
  progress_percent: number;
  contract_value: number | null;
  currency: string;
  is_client_visible: boolean;
  archived_at: string | null;

  /* The commercial detail a client document is written from. */
  terms: string | null;
  payment_terms: string | null;
  exclusions: string | null;
  internal_notes: string | null;

  /* What they asked for, and what we said we would build. Kept apart on
     purpose — the gap between the two is where projects go wrong. */
  client_brief: string | null;
  what_we_will_do: string | null;

  /* Money. `contract_value` is the quote before anything is knocked off; what
     has been paid is the sum of `payments` and is never a column here. */
  discount_amount: number;
  estimated_weeks: number | null;

  /* Approval, and what it started. */
  /* Changes, and delivery. Added by 20260830000018_changes_and_conversation.sql.
     `scope_delivered_at` is set by a trigger when everybody on the project has
     marked their part done — it is never typed in. */
  change_limit: number;
  change_terms: string | null;
  scope_delivered_at: string | null;

  approved_at: string | null;
  approved_note: string | null;
  lead_developer_id: string | null;
  accounts_created_at: string | null;
}

export type ProjectPhaseRow = Timestamps & {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  status: PhaseStatus;
  start_date: string | null;
  target_date: string | null;
  completed_at: string | null;
  weight: number;
  progress_percent: number;
}

export type ProjectMemberRow = {
  id: string;
  project_id: string;
  staff_id: string;
  role: MemberRole;
  is_client_visible: boolean;
  assigned_at: string;

  /* This person's part of the documented work. The project counts as delivered
     when nobody on it is still unfinished. */
  completed_at: string | null;
  completion_note: string | null;
}

export type RequirementRow = Timestamps & {
  id: string;
  project_id: string;
  phase_id: string | null;
  title: string;
  description: string | null;
  source: RequirementSource;
  status: RequirementStatus;
  sort_order: number;
}

export type MilestoneRow = Timestamps & {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  completed_at: string | null;
  requires_approval: boolean;
  payment_note: string | null;
  sort_order: number;
}

export type ApprovalRow = Timestamps & {
  id: string;
  project_id: string;
  milestone_id: string | null;
  phase_id: string | null;
  title: string;
  detail: string | null;
  status: ApprovalStatus;
  requested_by: string | null;
  responded_by: string | null;
  /** Who answered, captured at the time. Outlives their account. */
  responded_by_name: string | null;
  note: string | null;
  requested_at: string;
  responded_at: string | null;
}

export type TaskRow = Timestamps & {
  id: string;
  project_id: string;
  phase_id: string | null;
  requirement_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  created_by: string | null;
  created_by_type: ActorType;
  due_date: string | null;
  estimate_hours: number | null;
  logged_hours: number;
  sort_order: number;
  is_client_visible: boolean;
  blocked_reason: string | null;
  completed_at: string | null;
}

export type TaskCommentRow = Timestamps & {
  id: string;
  task_id: string;
  author_staff_id: string | null;
  author_client_id: string | null;
  author_type: ActorType;
  body: string;
  is_internal: boolean;
  attachments: Json;
}

export type ClientRequestRow = Timestamps & {
  id: string;
  project_id: string;
  client_user_id: string | null;
  title: string;
  description: string | null;
  attachments: Json;
  status: RequestStatus;
  reviewed_by: string | null;
  review_note: string | null;
  converted_task_id: string | null;
  is_scope_change: boolean;

  /* What the client said is holding them up. Added by 20260830000013.
     `tasks.priority` is what actually happens, and only an admin sets that —
     this is what they said, which is a different fact and worth keeping. */
  is_urgent: boolean;
  urgency_reason: string | null;

  /* Approval — the moment somebody decided this becomes work. Until it is set,
     no developer can see the request at all: the row policy, not a screen. */
  approved_at: string | null;
  approved_by: string | null;
  /** Which of the agreed change rounds this was, or null if it was not counted. */
  change_number: number | null;
}

export type ProjectFileRow = {
  id: string;
  project_id: string;
  filename: string;
  storage_key: string;
  mime_type: string | null;
  size_bytes: number | null;
  category: FileCategory;
  is_client_visible: boolean;
  version: number;
  uploaded_by: string | null;
  created_at: string;
}

export type ActivityLogRow = {
  id: string;
  project_id: string;
  actor_type: ActorType;
  actor_staff_id: string | null;
  actor_client_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string;
  is_client_visible: boolean;
  created_at: string;
}

export type PaymentRow = {
  id: string;
  project_id: string;
  amount: number;
  paid_on: string;
  method: "bank" | "upi" | "cash" | "cheque" | "card" | "other";
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
};

export type TimeEntryRow = {
  id: string;
  task_id: string;
  staff_id: string;
  minutes: number;
  note: string | null;
  logged_on: string;
  created_at: string;
}

/** One message in the conversation on a client request. */
export type RequestMessageRow = {
  id: string;
  request_id: string;
  staff_id: string | null;
  client_user_id: string | null;
  /** Kept on the message so a thread still reads properly after somebody leaves. */
  author_name: string;
  body: string;
  /** Staff talking among themselves. The policy hides these from a client. */
  is_internal: boolean;
  created_at: string;
};

/** One message in a project's own conversation. Not about one task or request. */
export type ProjectMessageRow = {
  id: string;
  project_id: string;
  staff_id: string | null;
  client_user_id: string | null;
  /** Kept on the message so a thread still reads properly after somebody leaves. */
  author_name: string;
  body: string;
  /** Staff talking among themselves. The policy hides these from a client. */
  is_internal: boolean;
  created_at: string;
};

/** One developer offering a task to another. Answered once, with a reason. */
export type TaskTransferRow = {
  id: string;
  task_id: string;
  from_staff_id: string;
  to_staff_id: string;
  reason: string;
  status: "pending" | "accepted" | "rejected";
  responded_at: string | null;
  response_reason: string | null;
  created_at: string;
};

/** A table as Supabase's client wants it: what comes out, goes in, and changes. */
type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  portal: {
    Tables: {
      staff: Table<StaffRow, "auth_user_id" | "full_name">;
      clients: Table<ClientRow, "name">;
      client_users: Table<ClientUserRow, "client_id" | "full_name" | "email">;
      client_projects: Table<ClientProjectRow, "client_id" | "name" | "slug">;
      project_phases: Table<ProjectPhaseRow, "project_id" | "name">;
      project_members: Table<ProjectMemberRow, "project_id" | "staff_id">;
      requirements: Table<RequirementRow, "project_id" | "title">;
      milestones: Table<MilestoneRow, "project_id" | "name">;
      approvals: Table<ApprovalRow, "project_id" | "title">;
      tasks: Table<TaskRow, "project_id" | "title">;
      task_comments: Table<TaskCommentRow, "task_id" | "body">;
      client_requests: Table<ClientRequestRow, "project_id" | "title">;
      request_messages: Table<RequestMessageRow, "request_id" | "author_name" | "body">;
      project_messages: Table<ProjectMessageRow, "project_id" | "author_name" | "body">;
      task_transfers: Table<TaskTransferRow, "task_id" | "from_staff_id" | "to_staff_id" | "reason">;
      project_files: Table<ProjectFileRow, "project_id" | "filename" | "storage_key">;
      activity_log: Table<ActivityLogRow, "project_id" | "action" | "entity" | "summary">;
      payments: Table<PaymentRow, "project_id" | "amount">;
      time_entries: Table<TimeEntryRow, "task_id" | "staff_id" | "minutes">;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      project_stage: ProjectStage;
      phase_status: PhaseStatus;
      task_status: TaskStatus;
      task_priority: TaskPriority;
      request_status: RequestStatus;
      health: Health;
      staff_role: StaffRole;
      client_user_role: ClientUserRole;
      member_role: MemberRole;
      requirement_source: RequirementSource;
      requirement_status: RequirementStatus;
      approval_status: ApprovalStatus;
      file_category: FileCategory;
      actor_type: ActorType;
      client_status: ClientStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}

/** Shorthands, so a component says `Tables<"tasks">` rather than the long form. */
export type Tables<T extends keyof Database["portal"]["Tables"]> =
  Database["portal"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["portal"]["Tables"]> =
  Database["portal"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["portal"]["Tables"]> =
  Database["portal"]["Tables"][T]["Update"];
