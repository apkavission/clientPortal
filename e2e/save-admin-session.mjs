/**
 * Save an admin session for the suite, by signing in once, by hand.
 *
 *     node e2e/save-admin-session.mjs
 *
 * A browser opens at the panel's sign-in screen. Sign in as yourself; when the
 * projects list appears, the session is written to `e2e/.auth/admin.json` and
 * the browser closes.
 *
 * **Why this is a person's job and not a password in a file.** The two test
 * accounts have their passwords in `.env.test.local` because they exist only for
 * testing. The admin account is the owner's own — the same login that reaches
 * the company website, the panel, and every client's data. Writing that password
 * anywhere a test can read it would make the whole estate only as safe as a
 * git-ignored file, and git-ignored files get copied, backed up and pasted.
 *
 * A session expires; a password does not. That is the trade, and it is the right
 * way round: the cost is a minute every few weeks, and the staff specs say
 * clearly when it is due rather than failing as though the application broke.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3100";
const FILE = "e2e/.auth/staff.json";

mkdirSync("e2e/.auth", { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

console.log("\nSign in as yourself in the window that just opened.");
console.log("It saves itself and closes as soon as the panel appears.\n");

await page.goto(`${BASE}/login`);

try {
  // Five minutes: long enough to find a password manager, short enough that a
  // forgotten window does not sit open all afternoon.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 300_000 });
  await page.waitForLoadState("networkidle");

  await context.storageState({ path: FILE });
  console.log(`Saved to ${FILE}. The staff specs will run again.`);
} catch {
  console.log("Nobody signed in, so nothing was saved.");
  process.exitCode = 1;
}

await browser.close();
