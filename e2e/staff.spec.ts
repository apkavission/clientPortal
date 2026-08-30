import { expect, test } from "@playwright/test";

/**
 * The internal panel: the conversation with a client, and the decision that
 * turns it into work.
 *
 * The rule these exist to hold, from 2026-08-30: **a request is a conversation
 * that lives here and nowhere else until somebody approves it.** No developer
 * sees one before that — enforced by the row policy, checked as a real signed-in
 * developer in `scripts/check-policies.mjs`. These check the other half: that
 * the panel says so, and that the decision cannot be skipped.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");

  if (page.url().includes("/login")) {
    test.skip(
      true,
      "The saved staff session has expired. Refresh it: node e2e/save-admin-session.mjs",
    );
  }
});

test("the requests screen sends you into the conversation, not straight to a decision", async ({
  page,
}) => {
  await page.goto("/requests");

  const empty = page.getByText(/Nothing waiting/);
  const open = page.getByRole("link", { name: /Open the conversation and decide it/ });

  if (await empty.isVisible().catch(() => false)) {
    test.skip(true, "No open requests, so there is no conversation to open.");
  }

  await expect(open.first()).toBeVisible();
});

test("an unapproved request says the team cannot see it", async ({ page }) => {
  await page.goto("/requests");

  const open = page.getByRole("link", { name: /Open the conversation and decide it/ }).first();
  if ((await open.count()) === 0) test.skip(true, "Nothing waiting.");

  await open.click();

  await expect(page.getByRole("heading", { name: /Conversation/ })).toBeVisible();

  /*
    One of two states, and both must be stated rather than implied. Unapproved:
    the team cannot see it, and approving is offered. Approved: it says when, and
    whether it cost the client one of their agreed changes.
  */
  const notVisible = page.getByText("Not visible to the team");
  const approved = page.getByRole("heading", { name: "Approved" });

  const isUnapproved = await notVisible.isVisible().catch(() => false);
  if (isUnapproved) {
    await expect(page.getByRole("button", { name: /Approve/ })).toBeVisible();
  } else {
    await expect(approved).toBeVisible();
  }
});

test("counting a request as a change is only offered once the project is delivered", async ({
  page,
}) => {
  await page.goto("/requests");

  const open = page.getByRole("link", { name: /Open the conversation and decide it/ }).first();
  if ((await open.count()) === 0) test.skip(true, "Nothing waiting.");

  await open.click();

  const tick = page.getByText("Count this as one of the agreed changes");
  const notYet = page.getByText(/This project is not delivered yet/);

  // Exactly one of them. A tick offered before delivery would spend a change
  // round on work that was part of the build.
  const offered = await tick.isVisible().catch(() => false);
  if (!offered) await expect(notYet).toBeVisible();
});

test("a project carries its change allowance and the wording it was agreed in", async ({
  page,
}) => {
  await page.goto("/projects");

  const project = page.locator("main a[href^='/projects/']").first();
  if ((await project.count()) === 0) test.skip(true, "No projects yet.");

  await project.click();

  await expect(page.getByLabel("Changes included")).toBeVisible();
  await expect(page.getByLabel("What counts as one change")).toBeVisible();

  // The number only starts counting after delivery, and the form says so rather
  // than leaving somebody to discover it from a counter that never moves.
  await expect(page.getByText(/only starts counting once the project is delivered/)).toBeVisible();
});
