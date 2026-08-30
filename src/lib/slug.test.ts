import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

/**
 * The address a project is reached at.
 *
 * It goes into a URL, so the failure to guard against is not an ugly slug — it
 * is a character that changes what the URL means.
 */

describe("slugify", () => {
  it("makes an ordinary name into an address", () => {
    expect(slugify("Clinic website and booking")).toBe("clinic-website-and-booking");
  });

  it("leaves nothing that would have to be escaped", () => {
    for (const name of ["A & B", "50% off!", "café / bar", "what?next#now"]) {
      expect(slugify(name)).toMatch(/^[a-z0-9-]*$/);
    }
  });

  it("cannot carry a path", () => {
    // The one that matters: a slash is just a character to the replacement.
    expect(slugify("../admin")).toBe("admin");
    expect(slugify("a/b/c")).toBe("a-b-c");
  });

  it("flattens accents rather than dropping the word", () => {
    // NFKD first, so "café" becomes "cafe" and not "caf".
    expect(slugify("Café project")).toBe("cafe-project");
  });

  it("collapses runs and trims both ends", () => {
    expect(slugify("  Website   redesign  ")).toBe("website-redesign");
    expect(slugify("--already--hyphenated--")).toBe("already-hyphenated");
  });

  it("caps the length", () => {
    expect(slugify("a".repeat(200)).length).toBe(60);
  });

  it("returns an empty string when there is nothing usable", () => {
    // The caller falls back to a default; inventing one here would hide the
    // fact that somebody named a project with punctuation.
    expect(slugify("!!!")).toBe("");
    expect(slugify("")).toBe("");
  });
});
