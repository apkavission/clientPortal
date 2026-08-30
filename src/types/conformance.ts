import type { Database as Generated } from "./database.generated";
import type {
  ActivityLogRow,
  ApprovalRow,
  ClientProjectRow,
  ClientRequestRow,
  ClientRow,
  ClientUserRow,
  MilestoneRow,
  PaymentRow,
  ProjectFileRow,
  ProjectMemberRow,
  ProjectMessageRow,
  ProjectPhaseRow,
  RequestMessageRow,
  RequirementRow,
  StaffRow,
  TaskCommentRow,
  TaskRow,
  TaskTransferRow,
  TimeEntryRow,
} from "./database";

/**
 * The hand-written types, checked against the database.
 *
 * ---------------------------------------------------------------------------
 * **The problem this closes.** `database.ts` is written by hand — deliberately,
 * because it carries the reasoning behind each column, which is the most useful
 * thing in it and something no generator can know. The cost was that it was the
 * one file in the project that could **silently disagree with the database**: a
 * migration adds a column, nobody updates the type, and the mismatch surfaces
 * weeks later as a value that is `undefined` at runtime and typed as present.
 *
 * That is no longer possible. `database.generated.ts` is read straight from the
 * live schema (`npm run gen:types`), and this file compares the two. Nothing
 * here runs — it is entirely types — and `tsc` fails if they have drifted.
 *
 * ---------------------------------------------------------------------------
 * **Three questions, not "are they identical".** Identity would be the wrong
 * test and would fail on things that are correct:
 *
 *   A hand-written type may be **narrower**. `task_transfers.status` is a text
 *   column with a check constraint, so the generator can only say `string`,
 *   while the hand-written type says `"pending" | "accepted" | "rejected"` —
 *   which is more true, not less.
 *
 * So what is checked is what actually goes wrong:
 *
 *   **Missing** — a column exists in the database and not in the type. This is
 *   the migration-was-run-and-nobody-noticed case.
 *   **Invented** — a column exists in the type and not in the database. Usually
 *   a rename that was only half applied.
 *   **Nullability** — a column the database allows to be null, typed as though
 *   it never is. The worst of the three, because it type-checks everywhere and
 *   fails at runtime on the one row that has a null.
 */

type Tables = Generated["portal"]["Tables"];

/** Columns the database has and the hand-written type does not. */
type Missing<Hand, Table extends keyof Tables> = Exclude<
  keyof Tables[Table]["Row"],
  keyof Hand
>;

/** Columns the hand-written type has and the database does not. */
type Invented<Hand, Table extends keyof Tables> = Exclude<
  keyof Hand,
  keyof Tables[Table]["Row"]
>;

/** Columns that can be null in the database and are not typed as nullable. */
type NullBlind<Hand, Table extends keyof Tables> = {
  [K in keyof Hand & keyof Tables[Table]["Row"]]: null extends Tables[Table]["Row"][K]
    ? null extends Hand[K]
      ? never
      : K
    : never;
}[keyof Hand & keyof Tables[Table]["Row"]];

/**
 * One table's verdict.
 *
 * Resolves to `true` when everything agrees, and otherwise to a string naming
 * the columns — which is what `tsc` prints, so the error says "missing:
 * change_limit" rather than "type X is not assignable to type Y".
 */
type Agrees<Hand, Table extends keyof Tables> = [Missing<Hand, Table>] extends [never]
  ? [Invented<Hand, Table>] extends [never]
    ? [NullBlind<Hand, Table>] extends [never]
      ? true
      : `column is nullable in the database but not in the type: ${string & NullBlind<Hand, Table>}`
    : `column is in the type and not in the database: ${string & Invented<Hand, Table>}`
  : `column is in the database and missing from the type: ${string & Missing<Hand, Table>}`;

/* Each line fails to compile if that table has drifted. `true` is the only
   value that satisfies a passing check; anything else resolves to the sentence
   describing what is wrong. */
const _checks = {
  staff: true satisfies Agrees<StaffRow, "staff">,
  clients: true satisfies Agrees<ClientRow, "clients">,
  client_users: true satisfies Agrees<ClientUserRow, "client_users">,
  client_projects: true satisfies Agrees<ClientProjectRow, "client_projects">,
  project_phases: true satisfies Agrees<ProjectPhaseRow, "project_phases">,
  project_members: true satisfies Agrees<ProjectMemberRow, "project_members">,
  requirements: true satisfies Agrees<RequirementRow, "requirements">,
  milestones: true satisfies Agrees<MilestoneRow, "milestones">,
  approvals: true satisfies Agrees<ApprovalRow, "approvals">,
  tasks: true satisfies Agrees<TaskRow, "tasks">,
  task_comments: true satisfies Agrees<TaskCommentRow, "task_comments">,
  client_requests: true satisfies Agrees<ClientRequestRow, "client_requests">,
  request_messages: true satisfies Agrees<RequestMessageRow, "request_messages">,
  project_messages: true satisfies Agrees<ProjectMessageRow, "project_messages">,
  task_transfers: true satisfies Agrees<TaskTransferRow, "task_transfers">,
  project_files: true satisfies Agrees<ProjectFileRow, "project_files">,
  activity_log: true satisfies Agrees<ActivityLogRow, "activity_log">,
  payments: true satisfies Agrees<PaymentRow, "payments">,
  time_entries: true satisfies Agrees<TimeEntryRow, "time_entries">,
} as const;

/* Underscored because nothing reads it at runtime — there is no runtime. The
   value exists so `satisfies` has something to check, and the export exists so
   the file is not treated as dead code and dropped. */
export type SchemaAgrees = typeof _checks;
