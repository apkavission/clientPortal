import { describe, expect, it } from "vitest";
import { formatDate, percent } from "@/lib/utils";

/**
 * The two helpers that touch every screen.
 *
 * Both look trivial and both have a failure that only shows up on somebody
 * else's machine — which is exactly the kind worth pinning.
 */

describe("percent", () => {
  it("rounds to a whole number", () => {
    expect(percent(62.4)).toBe(62);
    expect(percent(62.5)).toBe(63);
  });

  it("clamps to the ends of the bar", () => {
    /*
      A width of -4% or 140% is a bar that renders wrong rather than one that
      errors, so nothing complains and the page just looks broken.
    */
    expect(percent(-4)).toBe(0);
    expect(percent(140)).toBe(100);
  });

  it("treats nothing as zero rather than as NaN", () => {
    // `width: NaN%` is ignored by CSS, so the bar silently renders full-width.
    expect(percent(null)).toBe(0);
    expect(percent(undefined)).toBe(0);
    expect(percent(Number.NaN)).toBe(0);
  });
});

describe("formatDate", () => {
  it("writes a date the same way everywhere", () => {
    /*
      The reason this function exists rather than `toLocaleDateString()`.

      Without an explicit locale and time zone, the server and the browser can
      disagree — "29 Aug 2026" against "8/29/2026" — and that is a hydration
      mismatch that appears on a user's machine and never on the developer's.
    */
    expect(formatDate("2026-08-29T10:00:00Z")).toBe("29 Aug 2026");
  });

  it("uses India's day, not the machine's", () => {
    // 22:00 UTC is already the next day in Asia/Kolkata. A client in India
    // reading "28 Aug" for something that happened on the 29th their time would
    // be right to think the software is wrong.
    expect(formatDate("2026-08-28T22:00:00Z")).toBe("29 Aug 2026");
  });

  it("returns nothing for nothing, rather than 'Invalid Date'", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
    expect(formatDate("not a date")).toBe("");
  });
});
