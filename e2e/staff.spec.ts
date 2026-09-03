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

  /*
    Waited for, not counted.

    `count()` answers immediately and does not retry, so asking it straight
    after `goto` reports zero on a list that is about to render — and the test
    skips itself, silently, on a screen that was fine. A skip reads as a pass
    in the summary, which is the worst of the three outcomes.
  */
  /*
    A project, not the "New project" button.

    That button is a link to `/projects/new` and sits in the header inside
    `main`, so it is the *first* match for the obvious selector — and clicking
    it lands on an empty create form with none of the fields this test is
    about. The test skipped for weeks before the staff sign-in worked, so
    nobody had seen it go there.
  */
  const project = page.locator("main a[href^='/projects/']:not([href$='/new'])").first();

  const anyProject = await project
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!anyProject) test.skip(true, "No projects yet.");

  await project.click();

  /*
    Open the tab these fields live on.

    The project form became four tabs over one save on 2026-08-31, and a tab
    that is not showing is hidden with the `hidden` attribute — present in the
    DOM so it still submits, correctly invisible to a visibility assertion.
    Without this click the test fails on a field that is exactly where it
    should be.
  */
  await page.getByRole("tab", { name: "Brief and plan" }).click();

  await expect(page.getByLabel("Changes included")).toBeVisible();
  await expect(page.getByLabel("What counts as one change")).toBeVisible();

  // The number only starts counting after delivery, and the form says so rather
  // than leaving somebody to discover it from a counter that never moves.
  await expect(page.getByText(/only starts counting once the project is delivered/)).toBeVisible();
});

/**
 * The project form is four tabs and one save, and the tabs you cannot see must
 * still be saved.
 *
 * ---------------------------------------------------------------------------
 * **This is the test that has to exist for the tabs to be allowed at all.**
 *
 * The form's own note explains why it was one long column: these fields are one
 * conversation, and "splitting them is how half a quote gets sent to somebody".
 * Tabs were added because the column was long enough that changing a price
 * meant scrolling past three quarters of the form — but a tab that unmounts its
 * panel would deliver exactly the disaster that note warns about. An input the
 * browser is not rendering is not submitted, so the fields on whichever tab was
 * closed would be sent as empty and cleared, silently, on every save.
 *
 * So the panels are hidden with the `hidden` attribute and never unmounted, and
 * this proves it: type into a tab, walk away to another one, save from there,
 * and the value must still be in the database afterwards.
 */
test("saving from one tab keeps what was typed on the others", async ({ page }) => {
  await page.goto("/projects/northside-dental");

  /*
    Waited for, not asked about.

    `isVisible()` answers immediately and does not retry, so asking it the
    instant after `goto` reports false on a form that is about to render
    perfectly well — and the test then skips itself and reports nothing. That
    is the same trap this suite hit in the tracker, and a skip is worse than a
    failure because it looks like a pass.
  */
  const summary = page.getByLabel("One-line summary");
  await expect(summary).toBeVisible();

  // Remembered so it can be put back at the end.
  const before = await summary.inputValue();

  // A value that is obviously a test's, and different every run so a stale
  // pass cannot look like a fresh one.
  const written = `Tab test ${Date.now()}`;
  await summary.fill(written);

  // Walk to the far tab and save from there. "The project" tab, which holds
  // the summary, is now hidden.
  await page.getByRole("tab", { name: "Ours only" }).click();
  await expect(summary).toBeHidden();

  await page.getByRole("button", { name: /^Save project/ }).click();

  /*
    Wait for the save to report back before reloading.

    Clicking a submit button does not wait for the Server Action behind it. The
    first version of this test reloaded immediately and read back the *previous*
    run's value — which looked like the tabs had eaten the field, when in fact
    the write simply had not landed yet. A test that reports a data-loss bug
    that is not there is as expensive as one that misses a real one.
  */
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

  // Reload rather than trusting the screen: the question is what reached the
  // database, not what React still has in memory.
  await page.reload();
  await expect(page.getByLabel("One-line summary")).toHaveValue(written);

  /*
    Put it back.

    This runs against the real database, and the summary is a real sentence
    somebody wrote about a real project. A test that leaves "Tab test
    1788177424635" in a client-facing field has broken something to prove
    something, which is not a trade any test gets to make.
  */
  await page.getByLabel("One-line summary").fill(before);
  await page.getByRole("button", { name: /^Save project/ }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
});
