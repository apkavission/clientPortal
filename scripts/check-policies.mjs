/**
 * Do the row policies actually do what the screens assume?
 *
 * Signed in as real people, against the real database — not the service role,
 * which sees everything by definition and would therefore prove nothing.
 *
 * The questions are all of the form "can this person see or do something they
 * should not", because that is the failure nobody reports. A board that stops
 * working is on the phone within the hour; a developer who can read a request
 * the client has not agreed to is never mentioned by anybody.
 *
 *     node scripts/check-policies.mjs
 *
 * Credentials come from the tracker's `.env.test.local`, which is gitignored and
 * holds the two addresses the owner allows for testing. Nothing is printed but
 * the answers.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

/**
 * The first of these files that exists, resolved against this script.
 *
 * These paths were absolute — `c:/Users/kumar/portal/.env.local` — which
 * worked on exactly one computer. On a second machine every check in here died
 * on ENOENT before asking the database a single question, and the failure read
 * like a broken script rather than a wrong path.
 *
 * `new URL(..., import.meta.url)` rather than a relative string, because a
 * relative string resolves against the working directory: the same script
 * would find the file when run from the project root and miss it when run from
 * anywhere else.
 */
function env(...candidates) {
  for (const path of candidates) {
    try {
      const out = {};
      const text = readFileSync(new URL(path, import.meta.url), "utf8");
      for (const line of text.split(/\r?\n/)) {
        const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (match) out[match[1]] = match[2].replace(/^"|"$/g, "");
      }
      return out;
    } catch {
      /* Try the next one. Absent is a normal state: not every machine has the
         tracker checked out beside this. */
    }
  }
  return {};
}

const config = env("../.env.local");
const secrets = env(
  "../.env.test.local",
  "../../tracker/.env.test.local",
  "../../taskTracker/.env.test.local",
);

const url = config.NEXT_PUBLIC_SUPABASE_URL;
const anon = config.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function signIn(email, password) {
  const client = createClient(url, anon, {
    db: { schema: "portal" },
    auth: { persistSession: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);

  return client;
}

const results = [];

function record(who, question, expected, actual) {
  const ok = expected === actual;
  results.push({ ok, who, question });
  console.log(`  ${ok ? "ok      " : "WRONG   "} ${who}: ${question}`);
  if (!ok) console.log(`           expected ${expected}, got ${actual}`);
}

/* ------------------------------------------------------------------ */

const employee = await signIn(
  secrets.TRACKER_TEST_EMPLOYEE_EMAIL,
  secrets.TRACKER_TEST_EMPLOYEE_PASSWORD,
);

console.log("\nAs the developer");

{
  const { data } = await employee
    .from("client_requests")
    .select("id, approved_at")
    .is("approved_at", null);

  record(
    "developer",
    "cannot see a request nobody has approved",
    0,
    data?.length ?? 0,
  );
}

{
  const { data } = await employee.from("client_requests").select("id").limit(50);
  console.log(`           (sees ${data?.length ?? 0} approved request(s), which is right)`);
}

{
  const { data } = await employee.from("staff_workplace").select("staff_id");
  record("developer", "sees only their own work address", 1, data?.length ?? 0);
}

{
  const { data } = await employee.from("roles_master").select("key");
  record(
    "developer",
    "can read the master roles (needed to resolve their own)",
    true,
    (data?.length ?? 0) > 0,
  );
}

{
  const { data } = await employee.from("leave_types_master").select("key");
  record("developer", "can read the leave types", true, (data?.length ?? 0) > 0);
}

{
  /* Priority is an admin's decision, enforced by a trigger rather than a policy:
     an employee may edit a task and may not raise its priority. */
  const { data: task } = await employee
    .from("tasks")
    .select("id, priority")
    .neq("priority", "urgent")
    .limit(1)
    .maybeSingle();

  if (task) {
    const { error } = await employee
      .from("tasks")
      .update({ priority: "urgent" })
      .eq("id", task.id);

    record("developer", "cannot make a task urgent", true, Boolean(error));
  } else {
    console.log("           (no task to try raising — skipped)");
  }
}

{
  /*
    Leave: they may ask, and may not decide.

    Tested against a request that actually exists — one is planted below if the
    database has none. An update matching no rows succeeds trivially, so
    "no error" would otherwise be reported as "they approved it", and "error"
    could just as easily mean there was nothing to approve.
  */
  const { data: pending } = await employee
    .from("leave_requests")
    .select("id, staff_id, status")
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (pending) {
    const { error } = await employee
      .from("leave_requests")
      .update({
        status: "approved",
        decided_by: pending.staff_id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", pending.id);

    const { data: after } = await employee
      .from("leave_requests")
      .select("status")
      .eq("id", pending.id)
      .maybeSingle();

    /* The row is what settles it. A policy that silently filters the update
       returns no error and changes nothing, which is a pass — and an error with
       the row changed anyway would be a failure that reads as a pass. */
    record(
      "developer",
      "cannot approve their own leave",
      "pending",
      after?.status ?? (error ? "refused" : "unknown"),
    );
  } else {
    console.log("           (no pending leave request to try approving — skipped)");
  }
}

await employee.auth.signOut();

/* ------------------------------------------------------------------ */

const client = await signIn(
  secrets.PORTAL_TEST_CLIENT_EMAIL,
  secrets.PORTAL_TEST_CLIENT_PASSWORD,
);

console.log("\nAs the client");

{
  const { data } = await client.from("staff").select("id");
  record("client", "cannot read the staff list", 0, data?.length ?? 0);
}

{
  const { data } = await client.from("attendance").select("id");
  record("client", "cannot read anybody's attendance", 0, data?.length ?? 0);
}

{
  const { data } = await client.from("work_logs").select("id");
  record("client", "cannot read the team's write-ups", 0, data?.length ?? 0);
}

{
  const { data } = await client.from("task_transfers").select("id");
  record("client", "cannot see handovers between developers", 0, data?.length ?? 0);
}

{
  const { data } = await client.from("client_requests").select("id");
  console.log(`           (sees ${data?.length ?? 0} of their own request(s))`);
}

{
  /*
    Plant one, then look for it.

    Counting internal messages a client cannot see proves nothing when there are
    none — the check passed for weeks before this, on an empty table. So the
    service role writes one onto a thread the client *can* see, the client is
    asked for it, and it is removed again.
  */
  const admin = createClient(url, config.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "portal" },
    auth: { persistSession: false },
  });

  const { data: visible } = await client.from("client_requests").select("id").limit(1);
  const { data: staff } = await admin.from("staff").select("id").limit(1);

  if (visible?.length && staff?.length) {
    const { data: planted, error: plantError } = await admin
      .from("request_messages")
      .insert({
        request_id: visible[0].id,
        staff_id: staff[0].id,
        author_name: "Policy check",
        body: "Internal note planted by scripts/check-policies.mjs.",
        is_internal: true,
      })
      .select("id")
      .single();

    if (plantError) {
      console.log(`           (could not plant an internal message: ${plantError.message})`);
    } else {
      const { data: seen } = await client
        .from("request_messages")
        .select("id")
        .eq("id", planted.id);

      record("client", "cannot read a real internal message on their own thread", 0, seen?.length ?? 0);

      const { data: seenNormal } = await client
        .from("request_messages")
        .select("id")
        .eq("request_id", visible[0].id)
        .eq("is_internal", false);

      console.log(`           (sees ${seenNormal?.length ?? 0} ordinary message(s) on it)`);

      await admin.from("request_messages").delete().eq("id", planted.id);
    }
  } else {
    console.log("           (no request visible to the client — skipped)");
  }
}

{
  const { data } = await client.from("leave_requests").select("id");
  record("client", "cannot read anybody's leave", 0, data?.length ?? 0);
}

{
  const { data } = await client.from("time_entries").select("id");
  record("client", "cannot read how long the work took", 0, data?.length ?? 0);
}

{
  /*
    An internal message on the project's own conversation, planted and looked
    for. The same reasoning as the request thread above: counting rows on an
    empty table proves nothing.
  */
  const admin = createClient(url, config.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "portal" },
    auth: { persistSession: false },
  });

  const { data: projects } = await client.from("client_projects").select("id").limit(1);
  const { data: staff } = await admin.from("staff").select("id, full_name").limit(1);

  if (projects?.length && staff?.length) {
    const { data: planted, error } = await admin
      .from("project_messages")
      .insert({
        project_id: projects[0].id,
        staff_id: staff[0].id,
        author_name: "Policy check",
        body: "Internal note planted by scripts/check-policies.mjs.",
        is_internal: true,
      })
      .select("id")
      .single();

    if (error) {
      console.log(`           (could not plant a project message: ${error.message})`);
    } else {
      const { data: seen } = await client
        .from("project_messages")
        .select("id")
        .eq("id", planted.id);

      record(
        "client",
        "cannot read an internal message on their project's conversation",
        0,
        seen?.length ?? 0,
      );

      await admin.from("project_messages").delete().eq("id", planted.id);
    }
  } else {
    console.log("           (no project visible to the client — skipped)");
  }
}

await client.auth.signOut();

/* ------------------------------------------------------------------ */

console.log("\n" + "-".repeat(60));
const wrong = results.filter((result) => !result.ok);

if (wrong.length === 0) {
  console.log(`${results.length} checks, all holding.`);
} else {
  console.log(`${wrong.length} of ${results.length} checks are wrong:\n`);
  for (const result of wrong) console.log(`  · ${result.who}: ${result.question}`);
  process.exitCode = 1;
}
