"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMenu } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type ActionState } from "@/lib/actions/state";

/**
 * The conversation about a project as a whole.
 *
 * Deliberately its own copy rather than shared with the tracker: the standing
 * rule for this estate is that no project imports another's code, so a change
 * made there for their reasons cannot quietly alter what is written here.
 *
 * Not about one task, one request or one approval — those each have their own
 * thread, and keeping them apart is what makes them useful later. This is for
 * everything else, which used to happen on WhatsApp where nobody joining the
 * project later can read it.
 */

const schema = z.object({
  project_id: z.string().uuid(),
  body: z.string().trim().min(2, "Say something.").max(4000),
  internal: z.boolean(),
});

export async function sendProjectMessage(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireMenu("projects");

  const parsed = schema.safeParse({
    project_id: formData.get("project_id"),
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

  const { error } = await supabase.from("project_messages").insert({
    project_id: parsed.data.project_id,
    staff_id: session.staff.id,
    author_name: session.staff.full_name,
    body: parsed.data.body,
    is_internal: parsed.data.internal,
  });

  if (error) {
    console.error("[project chat] message failed:", error.message);
    return { status: "error", message: "That did not send. Nothing was added." };
  }

  revalidatePath("/projects");

  return {
    status: "success",
    message: parsed.data.internal ? "Added, visible to the team only." : "Sent.",
  };
}
