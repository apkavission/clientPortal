import type {
  ApprovalStatus,
  Health,
  PhaseStatus,
  ProjectStage,
  RequestStatus,
  RequirementStatus,
  TaskPriority,
  TaskStatus,
} from "@/types/database";

/**
 * Database words, in English a client can read.
 *
 * `in_progress` is a value, not a sentence. Rendering an enum straight onto a
 * page shows the reader the shape of the table, which is a small unkindness
 * that adds up across a screen.
 *
 * One map per enum, in one file, so the same status is never called two things
 * on two pages — which is the failure this replaces, not the underscore.
 */

export const STAGE_LABEL: Record<ProjectStage, string> = {
  discovery: "Discovery",
  design: "Design",
  development: "Development",
  testing: "Testing",
  launch: "Launch",
  support: "Support",
  on_hold: "On hold",
  closed: "Closed",
};

export const HEALTH_LABEL: Record<Health, string> = {
  on_track: "On track",
  at_risk: "At risk",
  delayed: "Delayed",
};

export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  blocked: "Blocked",
  /* Short on purpose: it is a column heading on a board that already has
     five, and "Needs changes" wraps on a phone. */
  needs_changes: "Changes",
  done: "Done",
  cancelled: "Cancelled",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: "Submitted",
  under_review: "Being looked at",
  accepted: "Accepted",
  declined: "Declined",
  converted: "Turned into work",
};

export const REQUIREMENT_STATUS_LABEL: Record<RequirementStatus, string> = {
  agreed: "Agreed",
  in_progress: "In progress",
  delivered: "Delivered",
  accepted: "Accepted",
  dropped: "Dropped",
};

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Waiting on you",
  approved: "Approved",
  changes_requested: "Changes asked for",
};

/**
 * The order a board reads in, left to right.
 *
 * `cancelled` is absent on purpose: a cancelled task is not a column somebody
 * works through, and giving it one invites it to fill up.
 */
export const BOARD_COLUMNS: TaskStatus[] = [
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
];

/* ---------------------------------------------------------------------------
   Tone.

   Which colour a status is drawn in. Kept beside the labels rather than in the
   components, so a status that is amber on one screen is amber on all of them.
   --------------------------------------------------------------------------- */

import type { BadgeTone } from "@/components/admin/badge";

export const HEALTH_TONE: Record<Health, BadgeTone> = {
  on_track: "success",
  at_risk: "warning",
  delayed: "danger",
};

export const TASK_TONE: Record<TaskStatus, BadgeTone> = {
  backlog: "neutral",
  todo: "neutral",
  in_progress: "info",
  in_review: "accent",
  blocked: "danger",
  /* Amber, not red. Work that came back is the review doing its job, not a
     problem with the project — colouring it like a blocker makes a healthy
     board look like it is on fire. */
  needs_changes: "warning",
  done: "success",
  cancelled: "neutral",
};

export const REQUEST_TONE: Record<RequestStatus, BadgeTone> = {
  submitted: "info",
  under_review: "accent",
  accepted: "success",
  declined: "neutral",
  converted: "success",
};

export const REQUIREMENT_TONE: Record<RequirementStatus, BadgeTone> = {
  agreed: "neutral",
  in_progress: "info",
  delivered: "accent",
  accepted: "success",
  dropped: "neutral",
};

export const APPROVAL_TONE: Record<ApprovalStatus, BadgeTone> = {
  pending: "warning",
  approved: "success",
  changes_requested: "danger",
};

export const PHASE_TONE: Record<PhaseStatus, BadgeTone> = {
  not_started: "neutral",
  in_progress: "info",
  blocked: "danger",
  done: "success",
};
