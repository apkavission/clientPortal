"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { menuOverrides } from "@/lib/auth/menu";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type ActionState } from "@/lib/actions/state";

/**
 * Who works here, and what each of them can open.
 *
 * Guarded by `requireOwner()` rather than by a menu key, and that is the whole
 * point of the screen: editing this table is how somebody grants themselves
 * every other screen, so it cannot be one of the things that can be granted.
 * The policies on `portal.staff` say the same thing at the database, which is
 * why handing it out any other way would produce a screen that loads and then
 * refuses every action on it.
 */

const saveSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(2, "They need a name.").max(160),
  role: z.enum(["owner", "manager", "developer", "designer", "qa"]),
  is_active: z.boolean(),
});

export async function saveStaffMember(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireOwner();

  const parsed = saveSchema.safeParse({
    id: formData.get("id"),
    full_name: formData.get("full_name"),
    role: formData.get("role"),
    is_active: formData.get("is_active") === "on",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  /*
    Nobody can lock themselves out.

    Removing your own owner role, or making your own account inactive, would
    take away the screen you would need to undo it — and on a two-person company
    there may be nobody else who can. Refused with a sentence rather than
    allowed and regretted.
  */
  if (parsed.data.id === session.staff.id) {
    if (!parsed.data.is_active) {
      return {
        status: "error",
        message: "You cannot deactivate your own account. Ask somebody else to do it.",
      };
    }
    if (parsed.data.role !== "owner" && parsed.data.role !== "manager") {
      return {
        status: "error",
        message:
          "You cannot take your own access to this screen away — you would not be able to put it back.",
      };
    }
  }

  /*
    The menu, stored as the difference from the role's default.

    Recomputed against the role being saved rather than the one that was on
    screen when the page loaded, so changing somebody's role and their screens in
    the same save produces the right answer instead of the difference from a
    role they no longer have.
  */
  const wanted = formData.getAll("menu").map(String);
  const { menu_extra, menu_denied } = menuOverrides(parsed.data.role, wanted);

  const supabase = await createClient();

  const { error } = await supabase
    .from("staff")
    .update({
      full_name: parsed.data.full_name,
      role: parsed.data.role,
      is_active: parsed.data.is_active,
      menu_extra,
      menu_denied,
    })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("[team] save failed:", error.message);
    return { status: "error", message: "Could not save. Nothing was changed." };
  }

  revalidatePath("/team");
  // The sidebar is built from this, so it has to be rebuilt everywhere.
  revalidatePath("/", "layout");

  return { status: "success", message: "Saved." };
}
