"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMenu } from "@/lib/auth/session";
import { firstPassword } from "@/lib/auth/first-password";
import { buildAccountEmail, sendMail } from "@/lib/email/mailer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type ActionState } from "@/lib/actions/state";

/**
 * Adding somebody at a client company, after the project was approved.
 *
 * Until now there was exactly one way a client got a login: approving their
 * project, which made one account for one named contact. Everybody else — the
 * second person who actually reads the updates, the one who took over when the
 * first left — was added by hand in the database, or not at all.
 *
 * **A login is created for them; they never sign themselves up.** The same rule
 * as every other account in this estate. The password is generated, emailed
 * once, and can never be read back.
 *
 * **One login belongs to one client company.** `client_users.auth_user_id` is
 * unique and the whole permission model rests on it — `portal.current_client_id()`
 * returns a single row, so a login attached to two companies would resolve to
 * whichever the database happened to return first, and one client would be
 * looking at another's projects. Refused here with a sentence, because the
 * constraint violation underneath is unreadable.
 */

const inviteSchema = z.object({
  client_id: z.string().uuid(),
  full_name: z.string().trim().min(2, "Who is it?").max(160),
  email: z.string().trim().toLowerCase().email("That does not look like an email address."),
  role: z.enum(["primary", "member", "viewer"]),
});

export async function inviteContact(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireMenu("clients");

  const parsed = inviteSchema.safeParse({
    client_id: formData.get("client_id"),
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    role: formData.get("role") || "member",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, company_name")
    .eq("id", parsed.data.client_id)
    .maybeSingle();

  if (!client) return { status: "error", message: "That client is no longer there." };

  /*
    Creating an auth user is an admin operation, so it goes through the service
    role. Authorisation was established above by `requireMenu` — this is the one
    kind of write where the row policies are not the backstop, because the auth
    schema has none of ours.
  */
  const admin = createAdminClient();

  const { data: existing } = await admin.auth.admin.listUsers();
  const found = (existing?.users ?? []).find(
    (user) => user.email?.toLowerCase() === parsed.data.email,
  );

  let userId = found?.id ?? null;
  let password: string | null = null;

  if (!userId) {
    password = firstPassword();

    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.full_name },
    });

    if (error || !data.user) {
      console.error("[contacts] could not create the login:", error?.message);
      return { status: "error", message: "Could not create their login. Nothing was changed." };
    }

    userId = data.user.id;
  }

  const { data: linked } = await supabase
    .from("client_users")
    .select("id, client_id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (linked && linked.client_id !== client.id) {
    return {
      status: "error",
      message:
        "That email already belongs to a different client, and one sign-in can only belong to one company. Use another address — nothing has been changed.",
      fieldErrors: { email: "Already in use by another client." },
    };
  }

  if (linked) {
    return {
      status: "error",
      message: "They are already a contact for this client.",
      fieldErrors: { email: "Already added." },
    };
  }

  const { error } = await supabase.from("client_users").insert({
    client_id: client.id,
    auth_user_id: userId,
    full_name: parsed.data.full_name,
    email: parsed.data.email,
    role: parsed.data.role,
    /*
      `accepted_at` is set now rather than left for them to accept.

      There is nothing to accept: the account exists and works the moment this
      row does. Leaving it null would mean carrying an "invited but not accepted"
      state that nothing ever changes, which is a column that lies about people
      who have been using the system for months.
    */
    accepted_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[contacts] could not link them:", error.message);
    return {
      status: "error",
      message: "The login exists but could not be linked to this client. Check before retrying.",
    };
  }

  /*
    Telling them is not the same as adding them, and it can fail on its own.

    The account exists by now. If the mail does not go, that is reported as what
    it is — somebody to tell by hand — rather than as a failure that leaves an
    owner believing no account was made.
  */
  const result = await buildAccountEmail({
    name: parsed.data.full_name,
    email: parsed.data.email,
    password,
    projectName: client.company_name ?? client.name,
    trackerUrl: process.env.NEXT_PUBLIC_TRACKER_URL ?? "http://localhost:3200",
    role: "client",
  }).then(sendMail);

  revalidatePath("/clients");
  revalidatePath(`/clients/${client.id}`);

  if (!result.sent) {
    return {
      status: "success",
      message: password
        ? "Added, and their login works — but the email did not go out. Send them the details by hand, or fix the mail settings and add them again to resend."
        : "Added. They already had a login, and the email did not go out.",
    };
  }

  return {
    status: "success",
    message: password
      ? "Added, and their login and password have been emailed to them."
      : "Added. They already had a login, so their existing password still works — we have emailed to say so.",
  };
}

/**
 * Take somebody's access away.
 *
 * The `client_users` row goes; the auth account does not. Deleting the login
 * would break every other place that person appears — a comment they wrote, an
 * approval they answered — and those records are the point of having them.
 *
 * So this is the same shape as blocking somebody in the company website: access
 * ends, history stays.
 */
export async function removeContact(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireMenu("clients");

  const id = String(formData.get("contact_id") ?? "");
  if (!id) return { status: "error", message: "That request did not make sense." };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_users")
    .update({ is_active: false })
    .eq("id", id)
    .select("id, client_id")
    .maybeSingle();

  if (error) {
    console.error("[contacts] could not remove them:", error.message);
    return { status: "error", message: "Could not change it." };
  }

  if (!data) return { status: "error", message: "That contact is no longer there." };

  revalidatePath("/clients");
  revalidatePath(`/clients/${data.client_id}`);

  return {
    status: "success",
    message: "Their access has ended. Everything they wrote stays where it is.",
  };
}
