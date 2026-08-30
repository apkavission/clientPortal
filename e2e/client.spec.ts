import { expect, test } from "@playwright/test";

/**
 * The client's own view of the panel.
 *
 * Their project, and nothing about how the work is done. These are the checks
 * that matter most in this application: on the wrong side of this line a client
 * sees another client's project, or an internal note about their own.
 */

test("lands on their own work, not on the team's", async ({ page }) => {
  await page.goto("/");

  // The team's screens exist in the same application and must not appear.
  await expect(page.getByRole("link", { name: "Clients", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Requests", exact: true })).toHaveCount(0);
});

test("cannot reach the team's screens by typing the address", async ({ page }) => {
  for (const route of ["/clients", "/requests", "/team", "/board"]) {
    await page.goto(route);

    /*
      Not found, or bounced. What must never happen is the screen rendering with
      its data missing — a client seeing the shape of the team's panel learns
      what exists, which is information they did not have.
    */
    const heading = page.getByRole("heading", { level: 1 });
    const text = (await heading.first().innerText().catch(() => "")) || "";

    expect(
      /clients|requests|team|board/i.test(text) && !/not found/i.test(text),
      `a client reached ${route} and saw "${text}"`,
    ).toBe(false);
  }
});
