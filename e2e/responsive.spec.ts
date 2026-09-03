import { expect, test } from "@playwright/test";

/**
 * Nothing in the panel scrolls sideways, at any width.
 *
 * ---------------------------------------------------------------------------
 * **This application had never been measured at any width.** The company
 * website has checked its public pages at six since August; the two panels —
 * the applications people actually use all day, and increasingly from a phone —
 * had nothing.
 *
 * A single element wider than the viewport makes the whole document scroll
 * sideways, and on a phone that turns every screen into something that slides
 * under the thumb while you are trying to tap it. It is also the failure most
 * easily introduced by an edit nobody thinks of as risky: a long unbroken word,
 * a table, a grid column that will not shrink.
 *
 * ---------------------------------------------------------------------------
 * **What this cannot see.** Whether a screen *reads* well at 360px needs eyes.
 * Wide content is allowed to scroll inside its own box — that is the rule — so
 * this measures the document and nothing else.
 */

/** Phone, big phone, tablet, laptop, desktop. */
const WIDTHS = [360, 390, 768, 1024, 1280, 1440];

const ROUTES: Array<[string, string]> = [
  ["/", "Overview"],
  ["/board", "The board"],
  ["/clients", "Clients"],
  ["/projects", "Projects"],
  ["/requests", "Requests"],
];

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const [path, name] of ROUTES) {
      test(`${name} does not scroll sideways`, async ({ page }) => {
        const response = await page.goto(path);

        /* A screen that redirected to the sign-in page is not this screen, and
           measuring it would pass while testing nothing. */
        expect(page.url(), `${path} should not have redirected`).not.toContain("/login");
        expect(response?.status(), `${path} should answer`).toBeLessThan(400);

        /* A lazy image or a web font still settling can change the layout once
           more after load. */
        await page.waitForLoadState("networkidle");

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));

        /* One pixel of tolerance: a sub-pixel width rounds up in Chromium and
           is not something a person can scroll. */
        expect(
          overflow.scrollWidth,
          `${path} is ${overflow.scrollWidth}px wide in a ${overflow.clientWidth}px viewport`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);
      });
    }
  });
}
