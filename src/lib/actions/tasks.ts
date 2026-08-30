"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type ActionState } from "@/lib/actions/state";

/**
 * Moving work along.
 *
 * Every one of these is a write a developer makes many times a day, so the
 * failures matter more than the happy path: a status that silently does not
 * save is worse than one that refuses, because the board looks right and the
 * client's percentage does not move.
 *
 * Nothing here writes a percentage. Progress is recomputed by a trigger when a
 * status changes — see `20260829000004_portal_progress.sql`. If this file ever
 * grows an `update({ progress_percent })`, that is the bug.
 */

const moveSchema = z
  .object({
    task_id: z.string().uuid(),
    status: z.enum([
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "blocked",
      "done",
      "cancelled",
    ]),
    blocked_reason: z.string().trim().max(500).optional(),
  })
  /*
    Blocking without saying why is refused here and by the table.

    The constraint is the one that cannot be got around; this is the one that
    produces a sentence under the box instead of a Postgres error.
  */
  .refine(
    (value) => value.status !== "blocked" || (value.blocked_reason ?? "").length > 0,
    {
      path: ["blocked_reason"],
      message: "Say what is blocking it. Nobody can unblock a task that does not say.",
    },
  );

/** Move a task to another status. */
export async function moveTask(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const parsed = moveSchema.safeParse({
    task_id: formData.get("task_id"),
    status: formData.get("status"),
    blocked_reason: formData.get("blocked_reason") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("tasks")
    .update({
      status: parsed.data.status,
      // Cleared when it stops being blocked, so an old reason cannot linger and
      // be read as current the next time it is blocked.
      blocked_reason:
        parsed.data.status === "blocked" ? (parsed.data.blocked_reason ?? null) : null,
    })
    .eq("id", parsed.data.task_id);

  if (error) {
    console.error("[tasks] move failed:", error.message);
    return { status: "error", message: "Could not move it. Nothing was changed." };
  }

  revalidatePath("/work", "layout");
  revalidatePath("/portal", "layout");

  return { status: "success", message: "Moved." };
}

const assignSchema = z.object({
  task_id: z.string().uuid(),
  // An empty string is "nobody", which is a real choice and not a missing value.
  assignee_id: z.string().uuid().or(z.literal("")),
});

export async function assignTask(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const parsed = assignSchema.safeParse({
    task_id: formData.get("task_id"),
    assignee_id: formData.get("assignee_id") ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: "That request did not make sense." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("tasks")
    .update({ assignee_id: parsed.data.assignee_id || null })
    .eq("id", parsed.data.task_id);

  if (error) {
    console.error("[tasks] assign failed:", error.message);
    return { status: "error", message: "Could not assign it." };
  }

  revalidatePath("/work", "layout");

  return { status: "success", message: "Assigned." };
}

const createSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().trim().min(3, "Give it a title.").max(160, "That title is too long."),
  estimate_hours: z.coerce.number().min(0).max(999).optional(),
  is_client_visible: z.boolean().optional(),
});

/**
 * Add a task.
 *
 * `is_client_visible` defaults to true, and that default is the important part.
 * A tracker where work is hidden unless somebody remembers to reveal it ends up
 * showing the client a percentage measured against a fraction of the job — the
 * safer default is that they see it, and hiding is the deliberate act.
 */
export async function createTask(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff();

  const parsed = createSchema.safeParse({
    project_id: formData.get("project_id"),
    title: formData.get("title"),
    estimate_hours: formData.get("estimate_hours") || undefined,
    is_client_visible: formData.get("is_client_visible") !== "off",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("tasks").insert({
    project_id: parsed.data.project_id,
    title: parsed.data.title,
    status: "todo",
    estimate_hours: parsed.data.estimate_hours ?? null,
    is_client_visible: parsed.data.is_client_visible ?? true,
    created_by: session.staff.id,
    created_by_type: "team",
  });

  if (error) {
    console.error("[tasks] create failed:", error.message);
    return { status: "error", message: "Could not add it." };
  }

  revalidatePath("/work", "layout");
  revalidatePath("/portal", "layout");

  return { status: "success", message: "Added." };
}
