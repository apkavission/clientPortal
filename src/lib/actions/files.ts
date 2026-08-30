"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMenu } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { type ActionState } from "@/lib/actions/state";

/**
 * Files on a project.
 *
 * ---------------------------------------------------------------------------
 * **The bucket is private and every read goes through the application.**
 *
 * A public bucket would mean one guessed or leaked path is one client reading
 * another's contract — no sign-in involved, and no record that it happened.
 * Instead: our own tables decide whether this person may have this file, and
 * only then is a short-lived signed URL made. That decision lives in
 * `app/api/files/[id]/route.ts`, once, rather than in every screen that shows a
 * download link.
 *
 * **`is_client_visible` is the whole point of the feature.** A project gathers
 * two kinds of file — the contract and the designs the client is meant to read,
 * and the notes, exports and half-finished things they are not. One bucket with
 * a flag is the only version of this anybody keeps tidy; two buckets means
 * somebody eventually uploads to the wrong one.
 *
 * ---------------------------------------------------------------------------
 * **Uploads go through the service role, deliberately.**
 *
 * Storage has its own policy system, separate from the tables. Writing a second
 * set of rules there — in a different language, about the same question — is how
 * the two answers drift apart, and the drift is invisible until somebody reads
 * something they should not. So storage trusts nobody, the application asks the
 * question, and `requireMenu` above is what makes that safe.
 */

const MAX_BYTES = 25 * 1024 * 1024;

const uploadSchema = z.object({
  project_id: z.string().uuid(),
  /* The four the database knows. A fifth here would be refused by the enum
     at insert time, with a message nobody could act on. */
  category: z.enum(["document", "design", "deliverable", "reference"]),
  is_client_visible: z.boolean(),
});

/** A storage key that cannot collide and says nothing about the file's contents. */
function keyFor(projectId: string, filename: string): string {
  const suffix = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  const stamp = Date.now().toString(36);
  const noise = Math.random().toString(36).slice(2, 8);
  return `${projectId}/${stamp}-${noise}${suffix.toLowerCase().slice(0, 12)}`;
}

export async function uploadProjectFile(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireMenu("projects");

  const parsed = uploadSchema.safeParse({
    project_id: formData.get("project_id"),
    category: formData.get("category") || "document",
    is_client_visible: formData.get("is_client_visible") === "on",
  });

  if (!parsed.success) {
    return { status: "error", message: "That request did not make sense." };
  }

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose a file first." };
  }

  if (file.size > MAX_BYTES) {
    return {
      status: "error",
      message: `That file is ${Math.round(file.size / 1024 / 1024)} MB and the limit is 25 MB. Send anything larger by email or a link.`,
    };
  }

  const supabase = await createClient();

  /* The project has to be one this person may see. The policy decides that, and
     a null result here means it is not theirs — checked before anything is
     written to storage, so a refusal never leaves an orphan object behind. */
  const { data: project } = await supabase
    .from("client_projects")
    .select("id, slug")
    .eq("id", parsed.data.project_id)
    .maybeSingle();

  if (!project) return { status: "error", message: "That project is no longer there." };

  const key = keyFor(project.id, file.name);
  const admin = createAdminClient();

  const { error: uploadError } = await admin.storage
    .from("project-files")
    .upload(key, file, { contentType: file.type || "application/octet-stream" });

  if (uploadError) {
    console.error("[files] upload failed:", uploadError.message);
    return { status: "error", message: "That did not upload. Nothing was saved." };
  }

  const { error } = await supabase.from("project_files").insert({
    project_id: project.id,
    filename: file.name.slice(0, 200),
    storage_key: key,
    mime_type: file.type || null,
    size_bytes: file.size,
    category: parsed.data.category,
    is_client_visible: parsed.data.is_client_visible,
    uploaded_by: session.staff.id,
  });

  if (error) {
    /*
      The object is in storage and no row points at it.

      Removed rather than left: an object nothing references is invisible to
      every screen, counts against the bill forever, and will be found by nobody.
      The upload is reported as failed because that is what happened.
    */
    console.error("[files] could not record the upload:", error.message);
    await admin.storage.from("project-files").remove([key]);

    return { status: "error", message: "That did not save. Nothing was kept." };
  }

  revalidatePath(`/projects/${project.slug}`);

  return {
    status: "success",
    message: parsed.data.is_client_visible
      ? "Uploaded. The client can see this one."
      : "Uploaded, and kept internal.",
  };
}

/**
 * Change who can see a file.
 *
 * Its own action rather than part of an edit form: this is the one property of a
 * file anybody changes after the fact, and it is usually changed the moment
 * somebody notices it is wrong.
 */
export async function setFileVisibility(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireMenu("projects");

  const id = String(formData.get("file_id") ?? "");
  const visible = formData.get("visible") === "true";

  if (!id) return { status: "error", message: "That request did not make sense." };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_files")
    .update({ is_client_visible: visible })
    .eq("id", id)
    .select("id, project_id")
    .maybeSingle();

  if (error || !data) {
    console.error("[files] visibility failed:", error?.message);
    return { status: "error", message: "Could not change it." };
  }

  revalidatePath("/projects");

  return {
    status: "success",
    message: visible ? "The client can see it now." : "Hidden from the client.",
  };
}

/**
 * Delete a file.
 *
 * The row and the object, in that order — and the object even if the row is
 * already gone. A file that disappears from the screen while the bytes stay in
 * storage is the worst of both: it cannot be found, and it is still there.
 */
export async function removeProjectFile(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireMenu("projects");

  const id = String(formData.get("file_id") ?? "");
  if (!id) return { status: "error", message: "That request did not make sense." };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_files")
    .delete()
    .eq("id", id)
    .select("storage_key, project_id")
    .maybeSingle();

  if (error) {
    console.error("[files] delete failed:", error.message);
    return { status: "error", message: "Could not remove it." };
  }

  if (!data) return { status: "error", message: "That file is no longer there." };

  const admin = createAdminClient();
  const { error: storageError } = await admin.storage
    .from("project-files")
    .remove([data.storage_key]);

  if (storageError) {
    // The row is gone, so nothing shows it any more. Said out loud because the
    // bytes are still being paid for and only a person can clear that up.
    console.error("[files] the row went but the object stayed:", storageError.message);
  }

  revalidatePath("/projects");

  return { status: "success", message: "Removed." };
}
