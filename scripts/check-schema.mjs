/**
 * Does the database actually have what the code now assumes?
 *
 * Six migrations were run by hand. This asks the live database for every column,
 * view and function added since 2026-08-30 — one narrow query each — and reports
 * what is missing rather than what is present, because a list of ticks is read
 * as "fine" whether or not anybody looked at it.
 *
 * Service role on purpose: this is checking that the schema exists, not that a
 * policy lets somebody read it. Policies get their own pass afterwards, signed
 * in as real people.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function env(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match) out[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  return out;
}

const config = env("c:/Users/kumar/portal/.env.local");
const url = config.NEXT_PUBLIC_SUPABASE_URL;
const key = config.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("No Supabase URL or service key in portal/.env.local.");
  process.exit(1);
}

const portal = createClient(url, key, { db: { schema: "portal" }, auth: { persistSession: false } });
const company = createClient(url, key, { db: { schema: "company" }, auth: { persistSession: false } });

const failures = [];

async function check(what, run) {
  try {
    const { error } = await run();
    if (error) {
      failures.push(`${what}: ${error.message}`);
      console.log(`  MISSING  ${what}`);
      console.log(`           ${error.message}`);
    } else {
      console.log(`  ok       ${what}`);
    }
  } catch (thrown) {
    failures.push(`${what}: ${thrown.message}`);
    console.log(`  THREW    ${what}: ${thrown.message}`);
  }
}

console.log("\ncompany — the master lists and the workplace");

await check("profiles.address / work_latitude / work_radius_metres", () =>
  company.from("profiles").select("id, address, work_latitude, work_longitude, work_radius_metres").limit(1),
);
await check("leave_types (seeded)", () =>
  company.from("leave_types").select("key, label, is_paid, needs_balance, is_system").limit(20),
);
await check("roles", () => company.from("roles").select("key, label, is_owner").limit(20));

console.log("\nportal — roles, leave types and the workplace, as seen from here");

await check("staff.role_key", () => portal.from("staff").select("id, full_name, role_key, is_active").limit(50));
await check("roles_master view", () => portal.from("roles_master").select("key, label, is_owner").limit(20));
await check("leave_types_master view", () =>
  portal.from("leave_types_master").select("key, label, needs_balance, is_active").limit(20),
);
await check("staff_workplace view", () =>
  portal.from("staff_workplace").select("staff_id, address, work_latitude, work_radius_metres").limit(10),
);

console.log("\nportal — the working day");

await check("attendance location columns", () =>
  portal
    .from("attendance")
    .select("id, clock_in_lat, clock_in_lng, clock_in_accuracy_m, clock_in_distance_m, clock_in_verdict, clock_out_verdict")
    .limit(1),
);
await check("work_logs", () => portal.from("work_logs").select("id, minutes, summary").limit(1));
await check("holidays", () => portal.from("holidays").select("id, on_date, name, is_optional").limit(1));

console.log("\nportal — leave");

await check("leave_requests.kind_key", () =>
  portal.from("leave_requests").select("id, kind, kind_key, status, day_part").limit(1),
);
await check("leave_entitlements.kind_key", () =>
  portal.from("leave_entitlements").select("id, year, kind, kind_key, days").limit(1),
);

console.log("\nportal — handovers, changes and the conversation");

await check("task_transfers", () =>
  portal.from("task_transfers").select("id, task_id, from_staff_id, to_staff_id, status, reason").limit(1),
);
await check("request_messages", () =>
  portal.from("request_messages").select("id, request_id, author_name, body, is_internal").limit(1),
);
await check("client_requests approval columns", () =>
  portal.from("client_requests").select("id, approved_at, approved_by, change_number, is_urgent, urgency_reason").limit(1),
);
await check("project_messages", () =>
  portal.from("project_messages").select("id, project_id, author_name, body, is_internal").limit(1),
);
await check("project_files", () =>
  portal.from("project_files").select("id, filename, storage_key, is_client_visible").limit(1),
);
await check("time_entries", () =>
  portal.from("time_entries").select("id, task_id, minutes, logged_on").limit(1),
);

await check("client_projects change columns", () =>
  portal.from("client_projects").select("id, change_limit, change_terms, scope_delivered_at").limit(1),
);
await check("project_members.completed_at", () =>
  portal.from("project_members").select("id, completed_at, completion_note").limit(1),
);

console.log("\nportal — the functions the code and the policies rely on");

await check("scope_is_complete()", async () => {
  const { data } = await portal.from("client_projects").select("id").limit(1);
  if (!data?.length) return { error: null };
  return portal.rpc("scope_is_complete", { p_project_id: data[0].id });
});

await check("changes_used()", async () => {
  const { data } = await portal.from("client_projects").select("id").limit(1);
  if (!data?.length) return { error: null };
  return portal.rpc("changes_used", { p_project_id: data[0].id });
});

await check("leave_remaining(uuid, text, integer)", async () => {
  const { data } = await portal.from("staff").select("id").limit(1);
  if (!data?.length) return { error: null };
  return portal.rpc("leave_remaining", {
    p_staff_id: data[0].id,
    p_kind: "casual",
    p_year: 2026,
  });
});

console.log("\n" + "-".repeat(60));

if (failures.length === 0) {
  console.log("Everything the new code reads exists in the database.");
} else {
  console.log(`${failures.length} thing(s) the code reads are not there:\n`);
  for (const failure of failures) console.log(`  · ${failure}`);
  process.exitCode = 1;
}
