"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMenu } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { firstPassword } from "@/lib/auth/first-password";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAccountEmail, sendMail } from "@/lib/email/mailer";
import { fieldErrors, type ActionState } from "@/lib/actions/state";
import { slugify } from "@/lib/slug";

function text(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function amount(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/* -------------------------------------------------------------------------- */
/* Creating and editing                                                        */
/* -------------------------------------------------------------------------- */

const createSchema = z.object({
  client_id: z.string().uuid("Choose a client."),
  name: z.string().trim().min(3, "Give the project a name.").max(160),
});

export async function createProject(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireMenu("projects");

  const parsed = createSchema.safeParse({
    client_id: formData.get("client_id"),
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const base = slugify(parsed.data.name) || "project";

  /*
    A slug has to be unique across the estate, because it is the address.

    Tried with a suffix rather than reported as an error: two clients asking for
    a "Website redesign" is ordinary, and making the second person rename their
    project to satisfy a database constraint would be the software's problem
    leaking onto them.
  */
  let slug = base;
  for (let attempt = 2; attempt <= 20; attempt++) {
    const { data: taken } = await supabase
      .from("client_projects")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!taken) break;
    slug = `${base}-${attempt}`;
  }

  const { data, error } = await supabase
    .from("client_projects")
    .insert({
      client_id: parsed.data.client_id,
      name: parsed.data.name,
      slug,
      stage: "discovery",
    })
    .select("slug")
    .single();

  if (error) {
    console.error("[projects] create failed:", error.message);
    return { status: "error", message: "Could not create it. Nothing was saved." };
  }

  revalidatePath("/projects");
  redirect(`/projects/${data.slug}`);
}

const saveSchema = z.object({
  name: z.string().trim().min(3, "Give the project a name.").max(160),
  summary: z.string().trim().max(600).optional(),
  stage: z.enum([
    "discovery",
    "design",
    "development",
    "testing",
    "launch",
    "support",
    "on_hold",
    "closed",
  ]),
  estimated_weeks: z.coerce.number().int().min(1).max(260).optional(),

  /*
    How many rounds of changes are included after delivery.

    Zero is a real answer and the commonest honest one — it means none were
    agreed, so anything further is quoted separately. It is not "unlimited", and
    the screen says so rather than leaving a blank field to be read either way.
  */
  change_limit: z.coerce
    .number()
    .int()
    .min(0, "Zero or more.")
    .max(99, "That is not a change allowance, that is a retainer.")
    .optional(),
});

/**
 * Everything about a project, saved in one go.
 *
 * One form rather than six, because the fields belong to one conversation: what
 * they asked for, what we will build, what it costs, how long, and what it does
 * not include. Splitting them into tabs that each save separately is how half a
 * quote gets sent.
 */
export async function saveProject(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireMenu("projects");

  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "That request did not make sense." };

  const parsed = saveSchema.safeParse({
    name: formData.get("name"),
    summary: formData.get("summary") || undefined,
    stage: formData.get("stage") || "discovery",
    estimated_weeks: formData.get("estimated_weeks") || undefined,
    change_limit: formData.get("change_limit") || 0,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const quoted = amount(formData.get("contract_value"));
  const discount = amount(formData.get("discount_amount")) ?? 0;

  // A discount larger than the quote is a typo, and letting it through would
  // put a negative total on a document going to a client.
  if (quoted !== null && discount > quoted) {
    return {
      status: "error",
      message: "The discount is more than the quote.",
      fieldErrors: {
        discount_amount: "This is more than the quoted amount. Check both figures.",
      },
    };
  }

  /*
    The two dates and the duration have to agree with each other.

    None of this was checked. A project could be saved starting on the 31st,
    due on the 10th of the following month, and described on the client's own
    document as ten weeks of work — eleven days of deadline behind a ten-week
    promise, with nothing anywhere objecting. The date inputs now carry a `min`,
    but that is a convenience in one browser: these values arrive as text in a
    POST and can say anything, so the rule lives here.

    The duration and the deadline are deliberately different fields — the hint
    on the form says so, one is what the client reads and the other is what we
    work to — so they are not forced to match. The only thing that cannot be
    true is a promise longer than the time allowed for it.
  */
  const startDate = text(formData.get("start_date"));
  const targetDate = text(formData.get("target_date"));

  if (startDate && targetDate && targetDate < startDate) {
    return {
      status: "error",
      message: "Check the dates.",
      fieldErrors: {
        target_date: "The target date is before the project starts.",
      },
    };
  }

  if (startDate && targetDate && parsed.data.estimated_weeks) {
    const days = Math.round(
      (Date.parse(targetDate) - Date.parse(startDate)) / 86_400_000,
    );
    const weeksAvailable = days / 7;

    if (parsed.data.estimated_weeks > Math.ceil(weeksAvailable)) {
      return {
        status: "error",
        message: "Check the dates.",
        fieldErrors: {
          estimated_weeks:
            `The document would say ${parsed.data.estimated_weeks} weeks, but the target ` +
            `date is ${days} day${days === 1 ? "" : "s"} after the start. Change one of them.`,
        },
      };
    }
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("client_projects")
    .update({
      name: parsed.data.name,
      summary: text(formData.get("summary")),
      stage: parsed.data.stage,
      // The values the checks above ran on, not a second read of the form.
      start_date: startDate,
      target_date: targetDate,
      estimated_weeks: parsed.data.estimated_weeks ?? null,

      /* Every ticked box, every time. A cleared fieldset sends nothing at all,
         so reading only what arrived would make "unchanged" and "all removed"
         look identical — and scope quietly staying on a project nobody meant
         it to be on is the expensive direction of that mistake. */
      service_keys: formData.getAll("service_keys").map(String).filter(Boolean),

      /* Whose project this is. Empty means nobody yet, which is a real state
         between one person leaving it and the next picking it up — and a
         better record than a name left there because the field would not save
         without one. */
      lead_developer_id: text(formData.get("lead_developer_id")),

      /* Which client this belongs to.
         Set once at creation until now, which meant a project started under
         the wrong company, or moved between two of a group's entities, could
         only be fixed in SQL. Blank is refused rather than stored: a project
         belonging to nobody has no client to show it to. */
      client_id: text(formData.get("client_id")) ?? undefined,

      client_brief: text(formData.get("client_brief")),
      what_we_will_do: text(formData.get("what_we_will_do")),
      exclusions: text(formData.get("exclusions")),
      terms: text(formData.get("terms")),
      payment_terms: text(formData.get("payment_terms")),
      internal_notes: text(formData.get("internal_notes")),

      contract_value: quoted,
      discount_amount: discount,

      /* The change allowance, and the wording it was agreed in. The tracker
         counts against this once the project is delivered; nothing counts
         before that, because a change is a change to something that was
         built. */
      change_limit: parsed.data.change_limit ?? 0,
      change_terms: text(formData.get("change_terms")),
      is_client_visible: formData.get("is_client_visible") === "on",
    })
    .eq("id", id);

  if (error) {
    console.error("[projects] save failed:", error.message);
    return { status: "error", message: "Could not save. Nothing was changed." };
  }

  /*
    Who is on the project, saved as a difference rather than as a replacement.

    Membership is not decoration: `scope_is_complete()` calls a project
    delivered when nobody on it is still unfinished, so these rows decide when
    it can be closed and when a change starts counting against the allowance.
    Nothing in the application wrote them until now — they arrived by hand, or
    they did not arrive.

    **Rows that stay are left alone.** Deleting everybody and re-inserting the
    ticked set would be shorter and would throw away `completed_at` on every
    person who had already finished, quietly un-delivering the project. Only
    the people actually added or removed are touched.
  */
  const wanted = new Set(formData.getAll("member_ids").map(String).filter(Boolean));

  const { data: current } = await supabase
    .from("project_members")
    .select("staff_id")
    .eq("project_id", id);

  const existing = new Set((current ?? []).map((row) => row.staff_id));

  const added = [...wanted].filter((staffId) => !existing.has(staffId));
  const removed = [...existing].filter((staffId) => !wanted.has(staffId));

  if (added.length > 0) {
    const { error: addError } = await supabase.from("project_members").insert(
      added.map((staffId) => ({
        project_id: id,
        staff_id: staffId,
        /* Everybody joins as a developer. A second role selector here would be
           two answers to "what do they do" on one screen; the member role is
           changed on the project itself if it is something else. */
        role: "developer" as const,
        is_client_visible: true,
      })),
    );

    if (addError) console.error("[projects] adding members failed:", addError.message);
  }

  if (removed.length > 0) {
    const { error: removeError } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", id)
      .in("staff_id", removed);

    if (removeError) console.error("[projects] removing members failed:", removeError.message);
  }

  revalidatePath("/projects");

  return { status: "success", message: "Saved." };
}

/* -------------------------------------------------------------------------- */
/* Money in                                                                    */
/* -------------------------------------------------------------------------- */

const paymentSchema = z.object({
  project_id: z.string().uuid(),
  amount: z.coerce.number().positive("How much came in?").max(99_999_999),
  paid_on: z.string().min(1, "When did it arrive?"),
  method: z.enum(["bank", "upi", "cash", "cheque", "card", "other"]),
  reference: z.string().trim().max(120).optional(),
});

/**
 * Record a payment.
 *
 * Each receipt is its own row and the totals are worked out from them. Nothing
 * anywhere lets somebody type "outstanding" — see `lib/money.ts`.
 */
export async function recordPayment(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireMenu("projects");

  const parsed = paymentSchema.safeParse({
    project_id: formData.get("project_id"),
    amount: formData.get("amount"),
    paid_on: formData.get("paid_on"),
    method: formData.get("method") || "bank",
    reference: formData.get("reference") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("payments").insert({
    project_id: parsed.data.project_id,
    amount: parsed.data.amount,
    paid_on: parsed.data.paid_on,
    method: parsed.data.method,
    reference: parsed.data.reference ?? null,
    recorded_by: session.staff.id,
  });

  if (error) {
    console.error("[payments] insert failed:", error.message);
    return { status: "error", message: "Could not record it. Nothing was saved." };
  }

  revalidatePath("/projects");

  return { status: "success", message: "Recorded." };
}

/* -------------------------------------------------------------------------- */
/* Approval, and the accounts it creates                                       */
/* -------------------------------------------------------------------------- */

const approveSchema = z.object({
  project_id: z.string().uuid(),
  lead_developer_id: z.string().uuid("Choose who is building it."),
  contact_name: z.string().trim().min(2, "Who is the client's contact?").max(160),
  contact_email: z.string().trim().email("That does not look like an email address."),
  note: z.string().trim().max(2000).optional(),
});

/**
 * The client said yes.
 *
 * This is the one action in the panel that reaches outside the database, and it
 * does four things in a deliberate order:
 *
 *   1. Make sure both people have a login.
 *   2. Link the client's contact to the client company.
 *   3. Mark the project approved, with who is building it.
 *   4. Email both of them the tracker address and how to get in.
 *
 * **The order matters.** Accounts first, because a project marked approved with
 * no logins behind it is a lie the next person has to untangle. The email last,
 * because it is the only step that can fail without leaving anything broken —
 * and if it does, the credentials still exist and can be re-sent by hand.
 *
 * **It refuses to run twice.** `accounts_created_at` is checked first. A second
 * run would generate a new password for somebody who may already have changed
 * theirs, and the only person who finds out is the one now locked out.
 *
 * **An existing account keeps its password.** A developer who already works here
 * has a login; they are told which project, not given new credentials.
 */
export async function approveProject(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireMenu("projects");

  const parsed = approveSchema.safeParse({
    project_id: formData.get("project_id"),
    lead_developer_id: formData.get("lead_developer_id"),
    contact_name: formData.get("contact_name"),
    contact_email: formData.get("contact_email"),
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

  const { data: project } = await supabase
    .from("client_projects")
    .select("id, name, slug, client_id, accounts_created_at")
    .eq("id", parsed.data.project_id)
    .maybeSingle();

  if (!project) return { status: "error", message: "That project no longer exists." };

  if (project.accounts_created_at) {
    return {
      status: "error",
      message:
        "This project has already been approved and the logins have already been sent. Re-sending would reset a password somebody may have changed.",
    };
  }

  const { data: developer } = await supabase
    .from("staff")
    .select("id, full_name, email, auth_user_id")
    .eq("id", parsed.data.lead_developer_id)
    .maybeSingle();

  if (!developer) return { status: "error", message: "That person is not on the team." };

  const trackerUrl = process.env.NEXT_PUBLIC_TRACKER_URL ?? "http://localhost:3200";

  /*
    The service-role client, used for the one thing it exists for.

    Creating an auth account cannot be done as the signed-in person, and the
    check that decides who may do it is the `requireMenu("projects")` at the top
    of this function. That is the rule for every use of this client: the
    permission is decided in the code above it, because the database will not.
  */
  const admin = createAdminClient();
  const { data: existing } = await admin.auth.admin.listUsers();
  const byEmail = new Map(
    (existing?.users ?? []).map((user) => [user.email?.toLowerCase(), user.id] as const),
  );

  // --- the client's contact ------------------------------------------------
  const contactEmail = parsed.data.contact_email.toLowerCase();
  let contactUserId = byEmail.get(contactEmail) ?? null;
  let contactPassword: string | null = null;

  if (!contactUserId) {
    contactPassword = firstPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email: contactEmail,
      password: contactPassword,
      email_confirm: true,
    });

    if (error || !data.user) {
      console.error("[approve] could not create the client login:", error?.message);
      return {
        status: "error",
        message: "Could not create the client's login. Nothing was changed.",
      };
    }
    contactUserId = data.user.id;
  }

  /*
    One login belongs to one client company, and that is a real limit.

    `client_users.auth_user_id` is unique, and the permission model depends on
    it: `portal.current_client_id()` returns a single row, so a login attached
    to two companies would resolve to whichever the database happened to return
    first — a client seeing another client's project, silently.

    So the same email cannot be the contact for two clients. That is a genuine
    restriction on consultants and on anybody who owns two businesses, and it is
    said out loud here rather than surfacing as a constraint violation. Without
    this check the approval failed with:

        duplicate key value violates unique constraint
        "client_users_auth_user_id_key"

    ...found on 2026-08-30 by approving a second project with an email already
    used on the first.
  */
  const { data: existingLink } = await supabase
    .from("client_users")
    .select("id, client_id")
    .eq("auth_user_id", contactUserId)
    .maybeSingle();

  if (existingLink && existingLink.client_id !== project.client_id) {
    return {
      status: "error",
      message:
        "That email already belongs to a different client, and one sign-in can only belong to one company. Use another address for this contact — nothing has been changed.",
      fieldErrors: { contact_email: "Already in use by another client." },
    };
  }

  const linked = existingLink;

  if (!linked) {
    const { error } = await supabase.from("client_users").insert({
      client_id: project.client_id,
      auth_user_id: contactUserId,
      full_name: parsed.data.contact_name,
      email: contactEmail,
      role: "primary",
      accepted_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[approve] could not link the contact:", error.message);
      return {
        status: "error",
        message: "The login was created but could not be linked to the client. Check the client before trying again.",
      };
    }
  }

  // --- mark it approved ----------------------------------------------------
  const { error: markError } = await supabase
    .from("client_projects")
    .update({
      approved_at: new Date().toISOString(),
      approved_note: parsed.data.note ?? null,
      lead_developer_id: developer.id,
      accounts_created_at: new Date().toISOString(),
      is_client_visible: true,
      stage: "design",
    })
    .eq("id", project.id);

  if (markError) {
    console.error("[approve] could not mark it approved:", markError.message);
    return {
      status: "error",
      message: "The logins exist but the project could not be marked approved. Do not run this again — check the project first.",
    };
  }

  // --- tell them -----------------------------------------------------------
  const results = await Promise.all([
    buildAccountEmail({
        name: parsed.data.contact_name,
        email: contactEmail,
        password: contactPassword,
      projectName: project.name,
      trackerUrl,
      role: "client",
    }).then(sendMail),
    developer.email
      ? buildAccountEmail({
            name: developer.full_name,
            email: developer.email,
            password: null,
          projectName: project.name,
          trackerUrl,
          role: "developer",
        }).then(sendMail)
      : Promise.resolve({ sent: false as const, reason: "not-configured" as const }),
  ]);

  revalidatePath("/projects");
  revalidatePath(`/projects/${project.slug}`);

  const unsent = results.filter((result) => !result.sent).length;

  if (unsent > 0) {
    return {
      status: "success",
      message: `Approved, and the logins are set up. ${unsent} of the 2 emails did not go out — check the mail settings and send those by hand.`,
    };
  }

  return { status: "success", message: "Approved. Both of them have been emailed." };
}
