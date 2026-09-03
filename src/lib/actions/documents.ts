"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMenu } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type ActionState } from "@/lib/actions/state";

/**
 * Issuing a document to a client — an invoice, an agreement to sign.
 *
 * ---------------------------------------------------------------------------
 * **What this deliberately does not know.**
 *
 * It does not know that an invoice needs an amount, or that a contract is
 * normally signed. Those live on the kind's own row in `document_types`, and a
 * trigger on `portal.documents` refuses anything incomplete.
 *
 * That is not indirection for its own sake: it is what makes a kind added next
 * month — a purchase order, an NDA — enforced without this file changing. A
 * validation rule copied into Zod here would be the second copy, and the second
 * copy is the one that gets forgotten.
 *
 * So the schema here checks only shapes: is this a uuid, is that a number. The
 * database checks meaning.
 */

const issueSchema = z.object({
  project_id: z.string().uuid(),
  client_id: z.string().uuid(),
  kind_key: z.string().min(1, "Choose what kind of document this is."),
  title: z
    .string()
    .trim()
    .min(2, "Give it a title somebody will recognise later.")
    .max(200, "That title is too long."),
  /*
    Optional here even for an invoice.

    The kind decides whether it is required, and the database says so in words
    the screen can show: "Invoice carries an amount, so it needs one." Making
    it required here as well would mean two messages for one rule, and they
    would drift the first time somebody edited one.
  */
  amount: z.coerce.number().positive().optional(),
  needs_signature: z.boolean(),
  note: z.string().trim().max(2000).optional(),
});

export async function issueDocument(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireMenu("projects");

  const amount = formData.get("amount");

  const parsed = issueSchema.safeParse({
    project_id: formData.get("project_id"),
    client_id: formData.get("client_id"),
    kind_key: formData.get("kind_key"),
    title: formData.get("title"),
    /* An empty box is "not given", not zero. `Number("")` is 0, which would
       file a ₹0 invoice and satisfy the rule that says one is required. */
    amount: amount === null || amount === "" ? undefined : amount,
    needs_signature: formData.get("needs_signature") === "on",
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("documents").insert({
    kind_key: parsed.data.kind_key,
    title: parsed.data.title,
    client_id: parsed.data.client_id,
    project_id: parsed.data.project_id,
    amount: parsed.data.amount?.toString() ?? null,
    needs_signature: parsed.data.needs_signature,
    note: parsed.data.note ?? null,
  });

  if (error) {
    /*
      The trigger's own words, shown as they are.

      It says "Invoice carries an amount, so it needs one" — which is exactly
      what somebody needs to read, and better than anything this file could
      write without knowing which kind they picked. A generic "could not save"
      would send them looking for a problem that is not there.
    */
    if (error.code === "23514" || error.message.includes("so it needs")) {
      return { status: "error", message: tidy(error.message) };
    }

    console.error("[documents] issue failed:", error.message);
    return { status: "error", message: "Could not issue it. Nothing was saved." };
  }

  revalidatePath("/projects");

  return { status: "success", message: "Issued. The client can see it in the tracker." };
}

/* -------------------------------------------------------------------------- */

/**
 * A database message, without the database.
 *
 * Postgres prefixes its own context onto a raised exception. The sentence
 * itself is written for a person to read; everything around it is not.
 */
function tidy(message: string): string {
  const sentence = message.split("\n")[0]?.trim() ?? message;
  return sentence.replace(/^ERROR:\s*/i, "");
}
