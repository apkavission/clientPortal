/**
 * Every screen a signed-in admin can reach, on a 360px phone and in the dark
 * theme.
 *
 * Three questions, because they are the three things a layer of new CSS breaks
 * and none of them show up in a typecheck, a lint or a unit test:
 *
 * 1. **Does anything push the page sideways?** Measured against the window, and
 *    ignoring anything inside a box that scrolls horizontally on purpose — a
 *    six-column table in its own scroll region is correct; the same table making
 *    the whole page shift is not.
 * 2. **Is any text too near its own background to read?** WCAG AA: 4.5:1, or 3:1
 *    from 24px up. The colour arithmetic is done by painting the real stack of
 *    backgrounds onto a canvas, which is the only way to be right about
 *    `color-mix()` and about surfaces with alpha in them. Two earlier versions
 *    of this file were wrong about exactly those two things and reported ten
 *    screens broken that were fine.
 * 3. **Did every screen answer 200?**
 *
 * It signs in for real with `ADMIN_EMAIL` from `.env.local` and needs the dev
 * server up. Run it after anything that touches the shell, the theme or
 * `globals.css`.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = (key) =>
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith(key + "="))
    ?.slice(key.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "");

const APP = ["portal", process.env.CHECK_BASE_URL ?? "http://localhost:3100", ["/", "/board", "/clients", "/clients/new", "/projects", "/projects/new", "/requests"]];

/**
 * Luminance contrast, the WCAG way, for any two CSS colours.
 *
 * Colours are resolved by painting them on a 1×1 canvas over white and reading
 * the pixel back, rather than by scraping numbers out of the string. The first
 * attempt did the latter and called every item in the tracker's header
 * unreadable at 2:1. The header is built on `color-mix()`, whose computed value
 * comes back as `oklab(0.999994 0.0000455 0.00002 / 0.88)` — white at 88% — and
 * three numbers pulled out of that and read as 0–255 describe near-black. The
 * application was fine; the check was wrong, which is the more dangerous of the
 * two, because it is the kind of wrong that gets a real screen "fixed".
 *
 * Painting also composites, which is why the background arrives as a *stack*
 * rather than a colour. The second attempt took the nearest ancestor with any
 * background at all and laid it over white; in the dark theme a `bg-surface-2/60`
 * table head — a dark colour at 60% — became light grey, and light text on it
 * was reported at 4.2:1. On screen that head is dark and the text on it is
 * white. So every background from the page down to the element is painted in
 * order, outermost first, and the ratio is read off the pixel that leaves.
 */
const CONTRAST = `(fg, stack) => {
  const pad = document.createElement("canvas");
  pad.width = pad.height = 1;
  const ink = pad.getContext("2d", { willReadFrequently: true });

  const paint = (layers) => {
    ink.fillStyle = "#ffffff";
    ink.fillRect(0, 0, 1, 1);
    for (const layer of layers) {
      ink.fillStyle = layer;
      ink.fillRect(0, 0, 1, 1);
    }
    const pixel = ink.getImageData(0, 0, 1, 1).data;
    return [pixel[0], pixel[1], pixel[2]];
  };

  /* The ink itself goes over the surface it actually sits on, so that text with
     its own alpha is judged on what is behind it rather than on white. */
  const parse = (value) => paint(Array.isArray(value) ? value : [value]);
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const surface = parse(stack);
  const a = lum(paint([...(Array.isArray(stack) ? stack : [stack]), fg]));
  const b = lum(surface);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}`;

const browser = await chromium.launch();
let failures = 0;
let checks = 0;

{
  const [name, base, paths] = APP;
  for (const [width, height, theme] of [
    [360, 780, "light"],
    [1440, 900, "dark"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: theme,
    });
    const page = await context.newPage();

    await page.goto(`${base}/login`, { waitUntil: "load", timeout: 180_000 });
    await page.getByLabel(/email/i).first().fill(env("ADMIN_EMAIL"));
    await page.getByLabel(/password/i).first().fill(env("ADMIN_PASSWORD"));
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();
    await page
      .waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60_000 })
      .catch(() => {});

    for (const path of paths) {
      const response = await page
        .goto(base + path, { waitUntil: "load", timeout: 120_000 })
        .catch(() => null);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);

      const result = await page.evaluate(
        ([contrastSource, viewportWidth]) => {
          const contrast = eval(`(${contrastSource})`);

          /* Anything wider than the window, ignoring what scrolls on purpose. */
          const wide = [];
          for (const el of document.querySelectorAll("body *")) {
            const box = el.getBoundingClientRect();
            if (box.width === 0) continue;
            if (box.right <= viewportWidth + 1 && box.left >= -1) continue;
            let scrolls = false;
            for (let p = el; p && p !== document.body; p = p.parentElement) {
              const overflow = getComputedStyle(p).overflowX;
              if (overflow === "auto" || overflow === "scroll") {
                scrolls = true;
                break;
              }
            }
            if (!scrolls) wide.push(el.tagName + "." + (el.className || "").toString().slice(0, 40));
          }

          /* Text too near its own background to read. */
          const faint = [];
          for (const el of document.querySelectorAll(
            "p, h1, h2, h3, span, a, td, th, dt, dd, li, label, button",
          )) {
            if (!el.textContent?.trim()) continue;
            if (el.querySelector("*")) continue;
            const box = el.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            const style = getComputedStyle(el);
            if (style.visibility === "hidden" || style.opacity === "0") continue;

            /* Every background from the element up to the root, then reversed,
               so they are painted the way the browser paints them: outermost
               first, each one over the last. Stopping at the first ancestor
               with a background is only correct when that background is
               opaque, and half the surfaces in this application are not. */
            const stack = [];
            for (let p = el; p; p = p.parentElement) {
              const colour = getComputedStyle(p).backgroundColor;
              if (colour && !colour.includes("rgba(0, 0, 0, 0)")) stack.push(colour);
            }
            stack.reverse();

            const ratio = contrast(style.color, stack);
            const big = parseFloat(style.fontSize) >= 24;
            if (ratio < (big ? 3 : 4.5)) {
              faint.push(
                `${el.tagName} "${el.textContent.trim().slice(0, 24)}" ${ratio.toFixed(1)}:1`,
              );
            }
          }

          return {
            wide: [...new Set(wide)].slice(0, 4),
            faint: [...new Set(faint)].slice(0, 4),
            scrollWidth: document.documentElement.scrollWidth,
          };
        },
        [CONTRAST, width],
      );

      checks += 1;
      const status = response?.status() ?? 0;
      const problems = [];
      if (status !== 200) problems.push(`HTTP ${status}`);
      if (result.scrollWidth > width + 1)
        problems.push(`page is ${result.scrollWidth}px wide: ${result.wide.join(", ")}`);
      if (result.faint.length) problems.push(`unreadable: ${result.faint.join("; ")}`);

      if (problems.length) {
        failures += 1;
        console.log(`FAIL ${name} ${width}px ${theme} ${path}\n     ${problems.join("\n     ")}`);
      }
    }

    await context.close();
    console.log(`${name} ${width}px ${theme}: done`);
  }
}

await browser.close();
console.log(
  failures === 0
    ? `\nAll ${checks} screen checks passed.`
    : `\n${failures} of ${checks} screen checks failed.`,
);
process.exit(failures === 0 ? 0 : 1);
