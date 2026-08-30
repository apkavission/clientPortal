"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMenu } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type ActionState } from "@/lib/actions/state";

/**
 * What the team does with a client's request.
 *
 * The rule this file implements: **a client asking for something does not
 * create work.** It creates a request, which somebody reads and either turns
 * into a task or declines with a reason.
 *
 * That queue is the feature rather than a formality. A client who can write
 * straight into the task list can change the scope of a fixed-price project
 * without anyone noticing, and the first time it is noticed is when the work
 * runs late and the conversation is already difficult. The queue moves that
 * conversation to the day the request arrives, which is when it is easy.
 *
 * Requests arrive from the client's own application, which is a separate
 * project. This one only answers them.
 *
 * Every write is guarded twice: `requireMenu()` decides who may run the action,
 * and the policies decide which rows it can touch. Both, on purpose — a server
 * action is a public HTTP endpoint, reachable by anybody who knows its name
 * whether or not a button for it was ever rendered.
 */

const triageSchema = z
  .object({
    request_id: z.string().uuid(),
    decision: z.enum(["under_review", "accepted", "declined"]),
    review_note: z.string().trim().max(2000).optional(),
    is_scope_change: z.boolean().optional(),
  })
  /*
    Declining without a reason is refused here as well as by the table.

    The database constraint is the one that cannot be bypassed; this one exists
    so the person doing the declining sees a sentence under the box rather than
    a constraint violation they cannot read.
  */
  .refine(
    (value) => value.decision !== "declined" || (value.review_note ?? "").length > 0,
    {
      path: ["review_note"],
      message: "Say why. A client told no with no reason will simply ask again.",
    },
  );

/** The team answers a request. */
export async function triageRequest(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireMenu("requests");

  const parsed = triageSchema.safeParse({
    request_id: formData.get("request_id"),
    decision: formData.get("decision"),
    review_note: formData.get("review_note") || undefined,
    is_scope_change: formData.get("is_scope_change") === "on",
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
    .from("client_requests")
    .update({
      status: parsed.data.decision,
      review_note: parsed.data.review_note ?? null,
      is_scope_change: parsed.data.is_scope_change ?? false,
      reviewed_by: session.staff.id,
    })
    .eq("id", parsed.data.request_id);

  if (error) {
    console.error("[requests] triage failed:", error.message);
    return { status: "error", message: "Could not save that. Nothing was changed." };
  }

  revalidatePath("/requests");
  revalidatePath("/projects");

  return { status: "success", message: "Answered." };
}

const convertSchema = z.object({
  request_id: z.string().uuid(),
  project_id: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  estimate_hours: z.coerce.number().min(0).max(999).optional(),
});

/**
 * Turn a request into work.
 *
 * Two writes that must both happen: the task is created, and the request is
 * pointed at it. Done in that order so a failure leaves a request that is still
 * open rather than one marked converted with nothing behind it — the table's
 * own constraint refuses that second state, which is what makes the ordering
 * safe rather than merely tidy.
 */
export async function convertRequest(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireMenu("requests");

  const parsed = convertSchema.safeParse({
    request_id: formData.get("request_id"),
    project_id: formData.get("project_id"),
    title: formData.get("title"),
    estimate_hours: formData.get("estimate_hours") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();

  /*
    Approval comes first, and the database will not be talked out of it.

    A trigger refuses a converted request that was never approved — which is the
    whole of the owner's rule from 2026-08-30: nothing reaches a developer until
    somebody decided it is work. Checked here as well so the answer is a sentence
    rather than a raised exception, and so it names the button to press.
  */
  const { data: existing } = await supabase
    .from("client_requests")
    .select("approved_at")
    .eq("id", parsed.data.request_id)
    .maybeSingle();

  if (!existing) {
    return { status: "error", message: "That request is no longer there." };
  }

  if (!existing.approved_at) {
    return {
      status: "error",
      message:
        "Approve it first. Until it is approved this is a conversation with the client, and no developer can see it.",
    };
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      project_id: parsed.data.project_id,
      title: parsed.data.title,
      status: "todo",
      created_by: session.staff.id,
      created_by_type: "client",
      estimate_hours: parsed.data.estimate_hours ?? null,
      is_client_visible: true,
    })
    .select("id")
    .single();

  if (taskError || !task) {
    console.error("[requests] convert failed at the task:", taskError?.message);
    return { status: "error", message: "Could not create the task. Nothing was changed." };
  }

  const { error: linkError } = await supabase
    .from("client_requests")
    .update({
      status: "converted",
      converted_task_id: task.id,
      reviewed_by: session.staff.id,
    })
    .eq("id", parsed.data.request_id);

  if (linkError) {
    /*
      The task exists and the request is still open.

      Said out loud rather than swallowed: somebody has to know a task was
      created, or they will convert the request a second time and end up with
      two. Deleting the task instead would be worse — it may already be
      assigned by the time anybody reads this.
    */
    console.error("[requests] convert made a task but could not link it:", linkError.message);
    return {
      status: "error",
      message:
        "The task was created but the request could not be marked converted. Check the board before converting it again.",
    };
  }

  revalidatePath("/requests");
  revalidatePath("/projects");

  return { status: "success", message: "Added to the board." };
}

const approveSchema = z.object({
  request_id: z.string().uuid(),
  as_change: z.boolean(),
});

/**
 * Agree that a request becomes work.
 *
 * **This is the moment the owner's rule turns on.** Before it, the request is a
 * conversation between the client and whoever runs the project, and the row
 * policy hands developers nothing at all. After it, the request is visible to
 * the team and can be turned into a task.
 *
 * ---------------------------------------------------------------------------
 * **Counting it as a change is a separate decision, and it is offered only when
 * it is real.**
 *
 * A change is a change to something that was built. Before the project is
 * delivered — before every person on it has marked their part done — everything
 * the client says is part of agreeing what to build, and charging that against
 * an allowance of three would be charging somebody for describing what they
 * wanted.
 *
 * Going past the allowance is refused rather than silently allowed, and the
 * message says where the decision belongs: raising the limit is a commercial
 * choice made on the project, not something to slip through on a request
 * screen.
 *
 * `change_number` is fixed at approval and never recomputed. Recounting later —
 * when a limit changes, or an earlier request is deleted — would rewrite what
 * the client was told at the time.
 */
export async function approveRequest(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireMenu("requests");

  const parsed = approveSchema.safeParse({
    request_id: formData.get("request_id"),
    as_change: formData.get("as_change") === "on",
  });

  if (!parsed.success) {
    return { status: "error", message: "That request did not make sense." };
  }

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("client_requests")
    .select("id, project_id, approved_at, change_number")
    .eq("id", parsed.data.request_id)
    .maybeSingle();

  if (!request) return { status: "error", message: "That request is no longer there." };

  if (request.approved_at) {
    return { status: "error", message: "That one is already approved." };
  }

  const { data: project } = await supabase
    .from("client_projects")
    .select("change_limit, scope_delivered_at, name")
    .eq("id", request.project_id)
    .maybeSingle();

  let changeNumber: number | null = null;

  if (parsed.data.as_change) {
    if (!project?.scope_delivered_at) {
      return {
        status: "error",
        message:
          "This project is not delivered yet, so this cannot be one of the agreed changes. Approve it as part of the work instead.",
      };
    }

    const { count } = await supabase
      .from("client_requests")
      .select("id", { count: "exact", head: true })
      .eq("project_id", request.project_id)
      .not("change_number", "is", null);

    const used = count ?? 0;
    const limit = project.change_limit ?? 0;

    if (used >= limit) {
      return {
        status: "error",
        message:
          limit === 0
            ? "No change rounds were agreed on this project. Raise the allowance on the project first, or approve this without counting it."
            : `All ${limit} agreed change${limit === 1 ? "" : "s"} have been used. Raise the allowance on the project first, or approve this without counting it.`,
      };
    }

    changeNumber = used + 1;
  }

  const { error } = await supabase
    .from("client_requests")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: session.staff.id,
      change_number: changeNumber,
      status: "accepted",
    })
    .eq("id", parsed.data.request_id)
    .is("approved_at", null);

  if (error) {
    console.error("[requests] approve failed:", error.message);
    return { status: "error", message: "Could not approve it. Nothing was changed." };
  }

  revalidatePath("/requests");
  revalidatePath("/projects");

  return {
    status: "success",
    message: changeNumber
      ? `Approved as change ${changeNumber}. The team can see it now.`
      : "Approved. The team can see it now.",
  };
}

const messageSchema = z.object({
  request_id: z.string().uuid(),
  body: z.string().trim().min(2, "Say something.").max(4000),
  internal: z.boolean(),
});

/**
 * Say something on a request.
 *
 * The conversation that used to happen on the phone. An internal message is
 * staff-only, and the policy on `request_messages` is what makes that true —
 * this only decides what to offer.
 *
 * The author's name is stored on the message rather than looked up through the
 * person: people leave, and a thread that reads "Someone: yes, we agreed to
 * this" a year later is worth nothing at exactly the moment it matters.
 */
export async function sendRequestMessage(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireMenu("requests");

  const parsed = messageSchema.safeParse({
    request_id: formData.get("request_id"),
    body: formData.get("body"),
    internal: formData.get("internal") === "on",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("request_messages").insert({
    request_id: parsed.data.request_id,
    staff_id: session.staff.id,
    author_name: session.staff.full_name,
    body: parsed.data.body,
    is_internal: parsed.data.internal,
  });

  if (error) {
    console.error("[requests] message failed:", error.message);
    return { status: "error", message: "That did not send. Nothing was added." };
  }

  revalidatePath("/requests");

  return {
    status: "success",
    message: parsed.data.internal ? "Added, visible to the team only." : "Sent.",
  };
}
