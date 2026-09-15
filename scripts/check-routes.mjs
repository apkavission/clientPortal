/**
 * Who can open what, asked of the running applications rather than of the code.
 *
 *     node scripts/check-routes.mjs
 *
 * ---------------------------------------------------------------------------
 * **Why this exists as well as `check-policies.mjs`.**
 *
 * That one asks the database which rows a signed-in person can read, which is
 * the guarantee that matters most and the one nothing in the browser can talk
 * its way past. This asks a different question: whether a person who types an
 * address they were not given a link to gets a screen. Both have to hold. A
 * page that renders with no rows on it still tells somebody the page exists,
 * what it is called, and roughly what it would show — and the owner's
 * instruction was that no URL should be reachable by the wrong person at all.
 *
 * ---------------------------------------------------------------------------
 * **It reads the page, not the status code, and that is the whole point.**
 *
 * The first version of this checked `response.status()` and reported every
 * refusal as a pass — because in development `notFound()` answers **200 with
 * the 404 page in the body**. Every route looked open. Reading the heading is
 * what tells a refusal from a screen, in both dev and production, so that is
 * what it does.
 *
 * Requires both dev servers, and `.env.test.local` for the sign-ins.
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const env = {};
for (const file of [".env.test.local", "../taskTracker/.env.test.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* not every machine has both */
  }
}

const PEOPLE = [
  { who: "signed out", email: null, password: null },
  {
    who: "client",
    from: "PORTAL_TEST_CLIENT_EMAIL",
    email: env.PORTAL_TEST_CLIENT_EMAIL,
    password: env.PORTAL_TEST_CLIENT_PASSWORD,
  },
  {
    who: "developer",
    from: "TRACKER_TEST_EMPLOYEE_EMAIL",
    email: env.TRACKER_TEST_EMPLOYEE_EMAIL,
    password: env.TRACKER_TEST_EMPLOYEE_PASSWORD,
  },
  {
    who: "admin",
    from: "PORTAL_TEST_STAFF_EMAIL",
    email: env.PORTAL_TEST_STAFF_EMAIL,
    password: env.PORTAL_TEST_STAFF_PASSWORD,
  },
];

/*
  Whose password this machine does not have.

  The same reasoning as the "application was not running" note at the foot of
  this file, applied one level up. A person with no credential cannot sign in,
  so every screen answers them with the sign-in page — and every screen they
  were *supposed* to reach then reads as a route that refused somebody it should
  have let in. On the machine this was written on, a missing
  `PORTAL_TEST_STAFF_EMAIL` produced **13 routes marked `!!`** across both
  applications, every one of them in the admin column, every one of them a lie.

  A check that cannot run has to say so. Counting it as a finding is worse than
  not running it, because the next real finding gets waved away as "probably
  just the credentials again".
*/
const ABSENT = PEOPLE.filter((person) => person.who !== "signed out" && !person.password);

/**
 * What each person should get. `open` means a real screen; anything else is a
 * refusal, and which kind of refusal does not matter — only that it is one.
 */
const APPS = [
  {
    name: "portal",
    base: process.env.PORTAL_URL ?? "http://localhost:3100",
    routes: {
      "/": { admin: "open", developer: "open" },
      "/board": { admin: "open", developer: "open" },
      "/clients": { admin: "open" },
      "/projects": { admin: "open", developer: "open" },
      "/requests": { admin: "open", developer: "open" },
      // Deleted on 2026-08-31: staff are managed in the company admin now.
      "/team": {},
    },
  },
  {
    name: "tracker",
    base: process.env.TRACKER_URL ?? "http://localhost:3200",
    routes: {
      "/": { admin: "open", developer: "open", client: "open" },
      "/day": { admin: "open", developer: "open" },
      "/calendar": { admin: "open", developer: "open" },
      "/leave": { admin: "open", developer: "open" },
      "/people": { admin: "open" },
      "/reports": { admin: "open" },
      "/waiting": { admin: "open", developer: "open", client: "open" },
      "/account": { admin: "open", developer: "open", client: "open" },
    },
  },
];

const browser = await chromium.launch();
let wrong = 0;

/** Applications that were not running. Counted, never treated as a pass. */
let unreachable = 0;

for (const app of APPS) {
  console.log(`\n${app.name}  (${app.base})`);

  /*
    Is it even there?

    Without this, a server that is not running turns every "should be open"
    into a failure and the run ends with a headline like "26 routes answered
    somebody they should not have" — which reads as a security finding and is
    nothing of the sort. A check that cries wolf about authorisation is worse
    than one that does not run, because the next real finding gets waved away
    with "the servers were probably down".
  */
  const reachable = await fetch(app.base, { redirect: "manual" })
    .then(() => true)
    .catch(() => false);

  if (!reachable) {
    console.log(`  not running — start it with 'npm run dev' in ${app.name}, then re-run.`);
    unreachable += 1;
    continue;
  }

  console.log("  " + "route".padEnd(13) + PEOPLE.map((p) => p.who.padEnd(13)).join(""));

  const sessions = new Map();

  for (const person of PEOPLE) {
    const context = await browser.newContext();

    if (person.email && person.password) {
      const page = await context.newPage();
      try {
        await page.goto(`${app.base}/login`, { waitUntil: "load", timeout: 90_000 });
        await page.getByLabel(/^Email/).fill(person.email);
        await page.getByLabel(/^Password/).fill(person.password);
        await page.getByRole("button", { name: /Sign in/ }).click();
        await page.waitForTimeout(3_000);
      } catch {
        // A person who cannot sign in here is simply signed out, which is
        // itself a refusal and reported as one.
      }
      await page.close();
    }

    sessions.set(person.who, context);
  }

  for (const [route, allowed] of Object.entries(app.routes)) {
    const cells = [];

    for (const person of PEOPLE) {
      const page = await sessions.get(person.who).newPage();
      let got = "error";

      try {
        await page.goto(app.base + route, { waitUntil: "load", timeout: 60_000 });
        await page.waitForTimeout(800);

        const landed = new URL(page.url()).pathname;
        const heading = await page
          .locator("h1")
          .first()
          .innerText()
          .catch(() => "");

        if (landed.startsWith("/login")) got = "login";
        else if (landed.startsWith("/no-access")) got = "no access";
        else if (heading.trim() === "404") got = "404";
        else if (landed !== route) got = "redirected";
        else got = "open";
      } catch {
        got = "error";
      }

      await page.close();

      const want = allowed[person.who] ?? "refused";

      /* No credential, no verdict. See ABSENT above. */
      if (!person.password && person.who !== "signed out") {
        cells.push("no login".padEnd(13));
        continue;
      }

      const ok = want === "open" ? got === "open" : got !== "open";
      if (!ok) wrong += 1;

      cells.push((ok ? got : `${got} !!`).padEnd(13));
    }

    console.log("  " + route.padEnd(13) + cells.join(""));
  }

  for (const context of sessions.values()) await context.close();
}

await browser.close();

/*
  An application that was not running is reported as exactly that.

  Never as a pass, and never folded into the failure count either: a run where
  both servers were down used to end with "26 routes answered somebody they
  should not have", which reads as a security finding and is nothing of the
  sort. The next real finding would then be waved away with "the servers were
  probably down".
*/
if (unreachable > 0) {
  console.log(
    `\n${unreachable} application(s) were not running, so nothing was checked for them. ` +
      "That is not a pass — start them and run this again.",
  );
} else if (wrong === 0) {
  console.log("\nEvery route answered the right person and refused the wrong one.");
} else {
  console.log(`\n${wrong} route(s) answered somebody they should not have. Marked !! above.`);
}

/*
  And whoever could not be asked, named — every time, without exception.

  Printed after the verdict so a real finding is read first, but never omitted:
  a column of "no login" is a column of questions nobody answered, and
  "Every route answered the right person" printed over a silently skipped admin
  is the most misleading thing this script could say. It is also why the exit
  code is not clean while somebody is unasked — a green check that checked
  three of four people is a green check nobody should trust.
*/
if (ABSENT.length > 0) {
  console.log(
    `
Not checked as: ${ABSENT.map((person) => person.who).join(", ")} — there is no ` +
      `password for them on this machine (${ABSENT.map((person) => person.from).join(", ")}). ` +
      'Those columns say "no login" and were not judged either way.',
  );
}

process.exit(wrong === 0 && unreachable === 0 && ABSENT.length === 0 ? 0 : 1);
