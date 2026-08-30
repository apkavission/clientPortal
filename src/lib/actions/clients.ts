"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMenu } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type ActionState } from "@/lib/actions/state";

/**
 * Clients: add, edit, remove.
 *
 * Every one of these calls `requireMenu("clients")` first. A server action is a
 * public HTTP endpoint — it is reachable by anybody who knows its name, whether
 * or not a button for it was ever rendered — so the check has to be in the
 * action rather than in the page that shows the form.
 */

const clientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the client a name.")
    .max(160, "That name is too long."),
  company_name: z.string().trim().max(160).optional(),
  email: z
    .string()
    .trim()
    .email("That does not look like an email address.")
    .max(160)
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  whatsapp: z.string().trim().max(40).optional(),
  gst: z.string().trim().max(40).optional(),
  address: z.string().trim().max(1000).optional(),
  status: z.enum(["prospect", "active", "paused", "closed"]),
  notes: z.string().trim().max(4000).optional(),
});

/** Nothing typed becomes an empty string in a column; it becomes absent. */
function text(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readForm(formData: FormData) {
  return {
    name: formData.get("name"),
    company_name: formData.get("company_name") || undefined,
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    whatsapp: formData.get("whatsapp") || undefined,
    gst: formData.get("gst") || undefined,
    address: formData.get("address") || undefined,
    status: formData.get("status") || "active",
    notes: formData.get("notes") || undefined,
  };
}

export async function createClientRecord(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireMenu("clients");

  const parsed = clientSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: parsed.data.name,
      company_name: text(parsed.data.company_name),
      email: text(parsed.data.email),
      phone: text(parsed.data.phone),
      whatsapp: text(parsed.data.whatsapp),
      gst: text(parsed.data.gst),
      address: text(parsed.data.address),
      status: parsed.data.status,
      notes: text(parsed.data.notes),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[clients] create failed:", error.message);
    return { status: "error", message: "Could not add them. Nothing was saved." };
  }

  revalidatePath("/clients");
  redirect(`/clients/${data.id}`);
}

export async function saveClientRecord(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireMenu("clients");

  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "That request did not make sense." };

  const parsed = clientSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("clients")
    .update({
      name: parsed.data.name,
      company_name: text(parsed.data.company_name),
      email: text(parsed.data.email),
      phone: text(parsed.data.phone),
      whatsapp: text(parsed.data.whatsapp),
      gst: text(parsed.data.gst),
      address: text(parsed.data.address),
      status: parsed.data.status,
      notes: text(parsed.data.notes),
    })
    .eq("id", id);

  if (error) {
    console.error("[clients] save failed:", error.message);
    return { status: "error", message: "Could not save. Nothing was changed." };
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);

  return { status: "success", message: "Saved." };
}

/**
 * Remove a client, and everything under them.
 *
 * The dialog in front of this says what "everything" means, because the cascade
 * reaches further than anybody expects: projects, phases, tasks, requests,
 * approvals and payments all go. There is no undo and no archive of it.
 *
 * Refused while any project still exists. Not because the database cannot do it
 * — it cascades happily — but because a delete that quietly takes four projects
 * with it is a delete somebody performs by accident exactly once.
 */
export async function deleteClientRecord(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireMenu("clients");

  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "That request did not make sense." };

  const supabase = await createClient();

  const { count } = await supabase
    .from("client_projects")
    .select("*", { count: "exact", head: true })
    .eq("client_id", id);

  if ((count ?? 0) > 0) {
    return {
      status: "error",
      message: `This client still has ${count} project${count === 1 ? "" : "s"}. Archive or delete those first — removing the client would take them with it.`,
    };
  }

  const { error } = await supabase.from("clients").delete().eq("id", id);

  if (error) {
    console.error("[clients] delete failed:", error.message);
    return { status: "error", message: "Could not remove them. Nothing was changed." };
  }

  revalidatePath("/clients");
  redirect("/clients");
}
