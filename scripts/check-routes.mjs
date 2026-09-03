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
    email: env.PORTAL_TEST_CLIENT_EMAIL,
    password: env.PORTAL_TEST_CLIENT_PASSWORD,
  },
  {
    who: "developer",
    email: env.TRACKER_TEST_EMPLOYEE_EMAIL,
    password: env.TRACKER_TEST_EMPLOYEE_PASSWORD,
  },
  {
    who: "admin",
    email: env.PORTAL_TEST_STAFF_EMAIL,
    password: env.PORTAL_TEST_STAFF_PASSWORD,
  },
];

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

process.exit(wrong === 0 && unreachable === 0 ? 0 : 1);
