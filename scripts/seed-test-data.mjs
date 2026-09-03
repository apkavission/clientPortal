/*
  Test data for the portal, written straight to the database.

  Not a fixture for automated tests and not production seed data — this is the
  set of rows needed to actually look at every screen, which is the only way to
  find out whether they work.

  Why SQL-side rather than through the forms: this application has no screens for
  creating clients, projects or phases yet. That is on the list in
  docs/PROGRESS.md rather than an oversight, and it is why this file exists.

  Deliberately shaped to exercise the rules rather than to look tidy:

    - tasks in every status, including a blocked one with a reason
    - internal tasks, so the client's percentage can be checked against the
      client-visible ones only
    - some tasks with estimates and some without, so both branches of the
      progress calculation run
    - a phase weighted heavier than another, so the weighting is visible
    - one approval waiting, one already answered
    - one client request waiting in the queue

  Run:  node scripts/seed-test-data.mjs
  Undo: node scripts/seed-test-data.mjs --clear
*/
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const db = createClient(url, key, {
  db: { schema: "portal" },
  auth: { autoRefreshToken: false, persistSession: false },
});
const auth = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/*
  The two addresses the owner named for testing, and no others.

  4384 already exists as an auth account; 4383 is created here if it does not.
  Nothing is ever sent to either — the account is created confirmed, so Supabase
  does not email an invitation.
*/
const OWNER_EMAIL = "apkavission@gmail.com";
const STAFF_EMAIL = "kumarnitish4384@gmail.com";
const CLIENT_EMAIL = "kumarnitish4383@gmail.com";

const CLIENT_SLUG = "northside-dental";


/**
 * Insert rows one at a time, and refuse to carry on quietly if one fails.
 *
 * Two lessons, both learned the hard way on 2026-08-30.
 *
 * **One at a time.** PostgREST builds a multi-row insert from the *first*
 * object's keys. A row further down that omits a key gets NULL rather than the
 * column's default — so an array of rows with different shapes fails on a
 * not-null column that has a perfectly good default:
 *
 *     23502 — null value in column "source" violates not-null constraint
 *
 * **Every error checked.** The first version of this script called `.insert()`
 * and ignored what came back. Two tables silently stayed empty and the script
 * reported success; the failure only surfaced three steps later as a null
 * reference on an unrelated line. A seed that lies about what it seeded is worse
 * than one that crashes.
 */
async function insertRows(table, rows) {
  for (const [index, row] of rows.entries()) {
    const { error } = await db.from(table).insert(row);
    if (error) {
      const name = row.title ?? row.name ?? `row ${index + 1}`;
      throw new Error(`${table} — "${name}": ${error.code} ${error.message}`);
    }
  }
}

async function userIdFor(email) {
  const { data } = await auth.auth.admin.listUsers();
  return data?.users.find((user) => user.email === email)?.id ?? null;
}

/**
 * The client's login, created if it is missing.
 *
 * The password is generated and written to `.env.test.local` — never printed,
 * never committed. `.env*.local` is already git-ignored by the Next.js default
 * ignore file, which is what makes that file a safe place for it.
 */
async function ensureClientLogin() {
  const existing = await userIdFor(CLIENT_EMAIL);
  if (existing) return { id: existing, password: null };

  const password = randomBytes(15).toString("base64url");

  const { data, error } = await auth.auth.admin.createUser({
    email: CLIENT_EMAIL,
    password,
    email_confirm: true,
  });

  if (error) throw new Error(`could not create the client login: ${error.message}`);

  const file = ".env.test.local";
  const line = `# Portal test client, created ${new Date().toISOString().slice(0, 10)}\nPORTAL_TEST_CLIENT_EMAIL=${CLIENT_EMAIL}\nPORTAL_TEST_CLIENT_PASSWORD=${password}\n`;
  if (existsSync(file)) appendFileSync(file, "\n" + line);
  else writeFileSync(file, line);

  return { id: data.user.id, password: "written to .env.test.local" };
}

async function clear() {
  // Not `maybeSingle`: a half-finished run can leave two, and this is exactly
  // the function that has to be able to tidy that up.
  const { data: clients } = await db
    .from("clients")
    .select("id")
    .eq("name", "Northside Dental")
    .order("created_at", { ascending: true });

  const client = clients?.[0] ?? null;

  if (!client) {
    console.log("nothing to remove");
    return;
  }

  /*
    Checked, because the first version of this was not.

    It deleted nothing and said it had. The rows it left behind then failed the
    next run on a unique slug, which is a confusing way to be told that a delete
    from ten minutes ago had silently refused.
  */
  const { data, error } = await db
    .from("clients")
    .delete()
    .eq("id", client.id)
    .select("id");

  if (error) throw new Error(`could not remove the test client: ${error.code} ${error.message}`);

  console.log(`removed ${data.length} test client and everything under it`);
}

async function seed() {
  const ownerId = await userIdFor(OWNER_EMAIL);
  const staffId = await userIdFor(STAFF_EMAIL);
  if (!ownerId) throw new Error(`no auth account for ${OWNER_EMAIL}`);

  // --- the team -----------------------------------------------------------
  await db.from("staff").upsert(
    [
      { auth_user_id: ownerId, full_name: "Nitish Kumar", email: OWNER_EMAIL, role: "owner" },
      ...(staffId
        ? [{ auth_user_id: staffId, full_name: "Test Developer", email: STAFF_EMAIL, role: "developer" }]
        : []),
    ],
    { onConflict: "auth_user_id" },
  );

  const { data: owner } = await db
    .from("staff")
    .select("id")
    .eq("auth_user_id", ownerId)
    .single();

  // --- the client ---------------------------------------------------------
  const login = await ensureClientLogin();

  const { data: client, error: clientError } = await db
    .from("clients")
    .insert({
      name: "Northside Dental",
      company_name: "Northside Dental Care Pvt Ltd",
      email: CLIENT_EMAIL,
      status: "active",
      notes: "Test client. Safe to delete — see scripts/seed-test-data.mjs --clear",
    })
    .select("id")
    .single();

  if (clientError) throw new Error(`client: ${clientError.message}`);

  const { data: clientUser } = await db
    .from("client_users")
    .insert({
      client_id: client.id,
      auth_user_id: login.id,
      full_name: "Priya Sharma",
      email: CLIENT_EMAIL,
      role: "primary",
      accepted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // --- the project --------------------------------------------------------
  const { data: project, error: projectError } = await db
    .from("client_projects")
    .insert({
      client_id: client.id,
      name: "Clinic website and booking",
      slug: CLIENT_SLUG,
      summary:
        "A website for the practice with online appointment booking, and an admin panel the reception desk runs it from.",
      stage: "development",
      start_date: "2026-08-01",
      target_date: "2026-10-15",
      contract_value: 185000,
      is_client_visible: true,
    })
    .select("id")
    .single();

  if (projectError) throw new Error(`project: ${projectError.message}`);

  await db.from("project_members").insert({
    project_id: project.id,
    staff_id: owner.id,
    role: "lead",
    is_client_visible: true,
  });

  // --- phases, weighted differently so the weighting is visible ------------
  const { data: phases } = await db
    .from("project_phases")
    .insert([
      { project_id: project.id, name: "Discovery and design", sort_order: 1, weight: 1, status: "done", completed_at: new Date().toISOString() },
      { project_id: project.id, name: "Build", sort_order: 2, weight: 3, status: "in_progress", completed_at: null },
      { project_id: project.id, name: "Launch", sort_order: 3, weight: 0.5, status: "not_started", completed_at: null },
    ])
    .select("id, name");

  const phase = (name) => phases.find((row) => row.name === name)?.id ?? null;

  // --- the agreed scope ---------------------------------------------------
  await insertRows("requirements", [
    { project_id: project.id, phase_id: phase("Discovery and design"), title: "Six page website", description: "Home, about, treatments, dentists, contact, book an appointment.", source: "contract", status: "accepted", sort_order: 1 },
    { project_id: project.id, phase_id: phase("Build"), title: "Online appointment booking", description: "Patients pick a dentist, a date and a slot. Confirmation by email.", source: "contract", status: "in_progress", sort_order: 2 },
    { project_id: project.id, phase_id: phase("Build"), title: "Reception admin panel", description: "See the day's appointments, move one, block a slot.", source: "contract", status: "in_progress", sort_order: 3 },
    { project_id: project.id, phase_id: phase("Launch"), title: "Domain, hosting and handover", description: null, source: "contract", status: "agreed", sort_order: 4 },
    { project_id: project.id, phase_id: null, title: "WhatsApp reminders", description: "Asked for during the project.", source: "client_request", status: "agreed", sort_order: 5 },
  ]);

  // --- the work -----------------------------------------------------------
  const task = (overrides) => ({
    project_id: project.id,
    phase_id: null,
    title: "",
    status: "todo",
    priority: "normal",
    assignee_id: null,
    estimate_hours: null,
    blocked_reason: null,
    is_client_visible: true,
    sort_order: 0,
    ...overrides,
  });

  await insertRows("tasks", [
    // Done, with estimates — these are what move the percentage.
    task({ phase_id: phase("Discovery and design"), title: "Sitemap and page structure", status: "done", estimate_hours: 6, assignee_id: owner.id, sort_order: 1 }),
    task({ phase_id: phase("Discovery and design"), title: "Design the six pages", status: "done", estimate_hours: 20, assignee_id: owner.id, sort_order: 2 }),
    task({ phase_id: phase("Build"), title: "Build the public pages", status: "done", estimate_hours: 24, assignee_id: owner.id, sort_order: 3 }),

    // In flight.
    task({ phase_id: phase("Build"), title: "Appointment booking flow", status: "in_progress", estimate_hours: 30, assignee_id: owner.id, priority: "high", sort_order: 4 }),
    task({ phase_id: phase("Build"), title: "Reception panel — day view", status: "in_review", estimate_hours: 16, assignee_id: owner.id, sort_order: 5 }),

    // Blocked, with the reason the table insists on.
    task({ phase_id: phase("Build"), title: "Send confirmation emails", status: "blocked", estimate_hours: 8, assignee_id: owner.id, blocked_reason: "Waiting for the clinic's email account details.", sort_order: 6 }),

    // Not started, and one with no estimate at all so both branches of the
    // progress calculation are exercised.
    task({ phase_id: phase("Build"), title: "Dentist profiles", status: "todo", estimate_hours: 10, sort_order: 7 }),
    task({ phase_id: phase("Launch"), title: "Point the domain and go live", status: "todo", sort_order: 8 }),

    // Internal. Must not appear to the client, and must not move their number —
    // the estimates here are deliberately large enough that they would wreck it
    // if they were counted.
    task({ phase_id: phase("Build"), title: "Set up the deployment pipeline", status: "done", estimate_hours: 40, is_client_visible: false, assignee_id: owner.id, sort_order: 9 }),
    task({ phase_id: phase("Build"), title: "Tidy up the seed script", status: "todo", estimate_hours: 40, is_client_visible: false, sort_order: 10 }),
  ]);

  // --- approvals: one waiting, one already answered ------------------------
  await insertRows("approvals", [
    { project_id: project.id, phase_id: phase("Build"), title: "Booking confirmation wording", detail: "The email a patient gets after booking. Please read it and tell us if anything is wrong.", requested_by: owner.id, status: "pending", responded_by: null, responded_by_name: null, responded_at: null, note: null },
    { project_id: project.id, phase_id: phase("Discovery and design"), title: "Final designs for the six pages", detail: "Signed off so the build could start.", requested_by: owner.id, status: "approved", responded_by: clientUser.id, responded_by_name: "Priya Sharma", responded_at: new Date().toISOString(), note: "Happy with these." },
  ]);

  // --- a request sitting in the queue --------------------------------------
  await db.from("client_requests").insert({
    project_id: project.id,
    client_user_id: clientUser.id,
    title: "Can patients cancel their own appointment?",
    description:
      "A few people have rung up to cancel. It would save the front desk a lot of calls if they could do it from the confirmation email.",
    status: "submitted",
  });

  // --- an internal comment, which a client must never see -------------------
  const { data: firstTask } = await db
    .from("tasks")
    .select("id")
    .eq("project_id", project.id)
    .eq("title", "Appointment booking flow")
    .single();

  await insertRows("task_comments", [
    { task_id: firstTask.id, author_staff_id: owner.id, author_type: "team", body: "Slot conflicts need a database constraint, not a check in the form.", is_internal: true },
    { task_id: firstTask.id, author_staff_id: owner.id, author_type: "team", body: "Booking works end to end on the test clinic now.", is_internal: false },
  ]);

  const { data: finished } = await db
    .from("client_projects")
    .select("progress_percent, health")
    .eq("id", project.id)
    .single();

  console.log("seeded:");
  console.log("  client       Northside Dental");
  console.log("  project      Clinic website and booking  ->  /portal/p/" + CLIENT_SLUG);
  console.log("  client login " + CLIENT_EMAIL + (login.password ? "  (password " + login.password + ")" : "  (already existed)"));
  console.log("  progress     " + finished.progress_percent + "%   health: " + finished.health);
  console.log("\n  The percentage is computed by the database. If it is 0, the triggers did not run.");
}

const clearing = process.argv.includes("--clear");
await (clearing ? clear() : seed());
