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

const env: Record<string, string> = {};
for (const file of [".env.test.local", "../tracker/.env.test.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
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
 * The staff session comes from a real sign-in, saved by hand.
 *
 * Cookies are scoped to `localhost` without a port, so a session saved in the
 * tracker on 3200 is valid here on 3100 — one sign-in serves both harnesses.
 * An empty state is written when there is none, so the specs load and skip with
 * an instruction rather than failing on a missing file.
 */
setup("carry the staff session across", async () => {
  const borrowed = ["../tracker/e2e/.auth/admin.json", "../services/e2e/.auth/owner.json"];
  const target = "e2e/.auth/staff.json";

  for (const source of borrowed) {
    if (existsSync(source)) {
      copyFileSync(source, target);
      return;
    }
  }

  writeFileSync(target, JSON.stringify({ cookies: [], origins: [] }));
});
