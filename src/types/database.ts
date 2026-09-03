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
  /**
   * Work that came back wrong.
   *
   * Not blocked — nothing is stopping it — and not in review, because it has
   * been reviewed. Without a column of its own it went back to "in progress"
   * and the fact that it had already failed once was lost.
   */
  | "needs_changes"
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

  /**
   * Which of our services this project is, as slugs from `company.services`.
   *
   * Empty is a real answer for a project agreed before this existed, and it is
   * shown as "not recorded" rather than as "none" — the two mean very
   * different things to whoever reads it next.
   */
  service_keys: string[];

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

  /**
   * What this change was priced at.
   *
   * Null and zero are different answers and both are real: null is "nobody has
   * priced it", zero is "priced, and we are not charging". A screen showing
   * both as ₹0 would turn the first into a promise.
   */
  quoted_amount: number | null;

  /**
   * Ad-hoc fields for this one request, as a flat object of label to value.
   *
   * `jsonb` rather than a table of field definitions, because what was asked
   * for was somewhere to put the one thing *this* request needs recorded. A
   * key that starts appearing on every row has earned a column.
   */
  extra: Json;

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

/**
 * One service from the company's catalogue, as this application sees it.
 *
 * `portal.services_master` is a read-only view onto `company.services`, edited
 * in the company website's admin and already the list a client reads on the
 * public site. A project stores slugs from it, so "is this a website, or a
 * website with SEO and marketing" is answered by the project rather than
 * inferred from its name.
 */
export type ServiceMasterRow = {
  slug: string;
  name: string;
  short_name: string | null;
  summary: string;
  sort_order: number;
  /** Published in the catalogue, so worth offering as a choice. */
  is_offered: boolean;
};

/**
 * The master roles, as this application sees them.
 *
 * `portal.roles_master` is a read-only view onto `company.roles`, edited in the
 * company website's admin. Declared here because the session resolves a staff
 * member's role through it — the label to show, whether they administer the
 * estate, and `portal_menu`: the screens the role reaches in this panel.
 *
 * That last column is the one that stopped this application carrying its own
 * map of role-to-screens. Every field is nullable in the view because a view's
 * columns always are, and the session treats a missing role as no access.
 */
export type RolesMasterRow = {
  key: string;
  label: string;
  description: string | null;
  is_owner: boolean;
  is_staff: boolean;
  is_active: boolean;
  sort_order: number;
  portal_menu: string[] | null;
};

/**
 * A kind of document, as a row rather than as an enum.
 *
 * Master data, like the roles and leave types beside it. Adding a purchase
 * order or an NDA is an admin writing a row, not a migration — and the rules
 * for each kind travel with it, so a new one enforces its own requirements the
 * moment it exists.
 */
export type DocumentTypeRow = {
  key: string;
  label: string;
  /** 'staff', 'client' or 'both' — who a document of this kind belongs to. */
  belongs_to: string;
  needs_period: boolean;
  needs_amount: boolean;
  signs_by_default: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Offer letters, salary slips, invoices and contracts.
 *
 * One row type because they are one noun. What differs is who may see one, and
 * that is decided by the owner columns rather than by the kind — deliberately
 * stricter than `payments` next door, which any member of staff may read.
 */
export type DocumentRow = {
  id: string;
  /** A key in `document_types`. Never compared to a literal in a page. */
  kind_key: string;
  title: string;
  /** Exactly one of these two. A staff document, or a client's. */
  staff_id: string | null;
  client_id: string | null;
  project_id: string | null;
  /** The client payment that settled this — money coming in. */
  payment_id: string | null;
  amount: string | null;
  period_start: string | null;
  period_end: string | null;
  issued_on: string;
  /** When this was paid, for money going out. Never set with `payment_id`. */
  paid_on: string | null;
  paid_method: string | null;
  storage_key: string | null;
  filename: string | null;
  mime_type: string | null;
  /** Waiting on signatures. Whether it *is* signed is counted, not stored. */
  needs_signature: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentSignatureRow = {
  id: string;
  document_id: string;
  /** 'company' is Apka Vission signing; 'client' is the other side. */
  party: "company" | "client";
  staff_id: string | null;
  client_user_id: string | null;
  /** The name as typed. Outlives the account that typed it. */
  signed_name: string;
  signature_image: string | null;
  signed_at: string;
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
      task_assignees: Table<
        {
          task_id: string;
          staff_id: string;
          assigned_by: string | null;
          /** Kept as a name too, so the admin view reads correctly after
              somebody leaves. */
          assigned_by_name: string | null;
          assigned_at: string;
        },
        "task_id" | "staff_id"
      >;

      /**
       * How a task got where it is.
       *
       * The board's memory: without it, "why is this blocked" has no answer a
       * week later. Insert-only — a record of what happened that can be edited
       * afterwards is not a record of what happened.
       */
      task_events: Table<
        {
          id: string;
          task_id: string;
          from_status: TaskStatus | null;
          to_status: TaskStatus;
          moved_by: string | null;
          moved_by_name: string;
          handed_to: string | null;
          handed_to_name: string | null;
          reason: string | null;
          created_at: string;
        },
        "task_id" | "to_status" | "moved_by_name"
      >;

      client_requests: Table<ClientRequestRow, "project_id" | "title">;
      request_messages: Table<RequestMessageRow, "request_id" | "author_name" | "body">;
      project_messages: Table<ProjectMessageRow, "project_id" | "author_name" | "body">;
      task_transfers: Table<TaskTransferRow, "task_id" | "from_staff_id" | "to_staff_id" | "reason">;
      project_files: Table<ProjectFileRow, "project_id" | "filename" | "storage_key">;
      activity_log: Table<ActivityLogRow, "project_id" | "action" | "entity" | "summary">;
      roles_master: Table<RolesMasterRow, "key" | "label">;
      services_master: Table<ServiceMasterRow, "slug" | "name">;
      payments: Table<PaymentRow, "project_id" | "amount">;
      time_entries: Table<TimeEntryRow, "task_id" | "staff_id" | "minutes">;
      document_types: Table<DocumentTypeRow, "key" | "label">;
      documents: Table<DocumentRow, "kind_key" | "title">;
      document_signatures: Table<
        DocumentSignatureRow,
        "document_id" | "party" | "signed_name"
      >;
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
