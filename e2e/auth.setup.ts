import { test as setup, expect } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";

/**
 * Sign the client in once, and borrow the staff session.
 *
 * The password is read from `.env.test.local`, which is git-ignored — never
 * typed into a spec, never printed. A test account's password in a repository is
 * a real password in a repository.
 */

/*
  The tracker's copy is looked for under both names it has been cloned as.

  It was `../tracker` alone, which is what the folder is called on the machine
  this was written on. On the second machine every project sits under its
  GitHub name — `taskTracker` — so the file was simply never found, and the
  suite failed on an undefined password rather than on a missing file, which
  reads like a broken sign-in instead of an absent credential.
*/
const env: Record<string, string> = {};
for (const file of [
  ".env.test.local",
  "../tracker/.env.test.local",
  "../taskTracker/.env.test.local",
]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* not every machine has both */
  }
}

mkdirSync("e2e/.auth", { recursive: true });

setup("sign in as the client", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/^Email/).fill(env.PORTAL_TEST_CLIENT_EMAIL);
  await page.getByLabel(/^Password/).fill(env.PORTAL_TEST_CLIENT_PASSWORD);
  await page.getByRole("button", { name: /Sign in/ }).click();

  /*
    Thirty seconds, not the default: the redirect after signing in is the first
    request for the landing page, and on a cold dev server that is a compile.
    Waiting longer on the one assertion known to sit in front of a compile is
    honest; a retry would hide a real failure.
  */
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await page.context().storageState({ path: "e2e/.auth/client.json" });
});

/**
 * The staff session, from a real sign-in.
 *
 * This used to be borrowed: copy `admin.json` out of the tracker, or
 * `owner.json` out of the company website, and write an empty state when
 * neither was there. The specs then skipped with an instruction. That was the
 * right answer while the only staff account was the owner's own, whose
 * password is deliberately nowhere a test can read it.
 *
 * There is a staff *test* account now — one that exists only for this, reaches
 * only the demo client, and whose password belongs in `.env.test.local` for
 * the same reason the client's and the employee's do. So this signs in, and
 * four specs that skipped for weeks run.
 *
 * The borrow is kept as a fallback rather than deleted: a machine with no
 * `.env.test.local` still gets a session if another application has left one
 * lying about, which is better than failing at sign-in on an undefined
 * password.
 */
setup("sign in as staff", async ({ page }) => {
  const target = "e2e/.auth/staff.json";

  if (env.PORTAL_TEST_STAFF_EMAIL && env.PORTAL_TEST_STAFF_PASSWORD) {
    await page.goto("/login");
    await page.getByLabel(/^Email/).fill(env.PORTAL_TEST_STAFF_EMAIL);
    await page.getByLabel(/^Password/).fill(env.PORTAL_TEST_STAFF_PASSWORD);
    await page.getByRole("button", { name: /Sign in/ }).click();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
    await page.context().storageState({ path: target });
    return;
  }

  for (const source of [
    "../tracker/e2e/.auth/admin.json",
    "../taskTracker/e2e/.auth/admin.json",
    "../services/e2e/.auth/owner.json",
  ]) {
    if (existsSync(source)) {
      copyFileSync(source, target);
      return;
    }
  }

  writeFileSync(target, JSON.stringify({ cookies: [], origins: [] }));
});
