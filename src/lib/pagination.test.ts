/*
 * Copied from the company website, deliberately.
 *
 * The estate's rule is that no project imports another's code, so a change
 * made there for its own reasons can never alter this one. These three copies
 * are kept in step by hand; there is no build step that can do it, and
 * pretending otherwise would be worse.
 */
import { describe, expect, it } from "vitest";
import {
  describe as summarise,
  hrefFor,
  pageNumbers,
  requestedPage,
  resolve,
  withoutPage,
  PAGE_SIZE,
} from "@/lib/pagination";

/**
 * The three things pagination gets wrong, tested.
 *
 * ---------------------------------------------------------------------------
 * Everything here is about a case that only shows up with real data: a search
 * that narrows the list under somebody's feet, an address typed by hand, a
 * filter that has to reset the page. The happy path — page two of five — is the
 * part nobody breaks.
 */

describe("requestedPage", () => {
  it("reads the page from the address", () => {
    expect(requestedPage({ page: "3" }, 25)).toMatchObject({ page: 3, from: 50, to: 74 });
  });

  it("treats nonsense as page one rather than complaining", () => {
    /* A list of records should show something. These come from hand-edited
       addresses and stale links, and an error page helps nobody. */
    for (const page of ["0", "-2", "abc", "", "1.5e9999"]) {
      expect(requestedPage({ page }).page, `page=${page}`).toBe(1);
    }

    expect(requestedPage({}).page).toBe(1);
  });
});

describe("resolve", () => {
  it("clamps a page past the end to the last one", () => {
    /*
      The case this exists for: somebody is on page 7, searches for something
      that narrows the list to 30 rows, and the address still says 7. An empty
      list would read as "your search found nothing", which is wrong and
      indistinguishable from the truth.
    */
    const paged = resolve([1, 2, 3], 30, requestedPage({ page: "7" }, 25));

    expect(paged.pages).toBe(2);
    expect(paged.page).toBe(2);
  });

  it("is one page when there is nothing at all", () => {
    const paged = resolve([], 0, requestedPage({}));
    expect(paged.pages).toBe(1);
    expect(paged.page).toBe(1);
  });
});

describe("hrefFor", () => {
  it("keeps the search and the filters", () => {
    /* The whole point. "Page 2" only means anything as page 2 *of what is on
       the screen*, so everything that decided that has to come along. */
    const href = hrefFor("/admin/leads", { q: "clinic", status: "new" }, 3);

    expect(href).toContain("q=clinic");
    expect(href).toContain("status=new");
    expect(href).toContain("page=3");
  });

  it("drops the parameter on page one, so the first page has one address", () => {
    expect(hrefFor("/admin/leads", { q: "clinic" }, 1)).toBe("/admin/leads?q=clinic");
    expect(hrefFor("/admin/leads", {}, 1)).toBe("/admin/leads");
  });

  it("replaces the page rather than adding a second one", () => {
    const href = hrefFor("/admin/leads", { page: "2", q: "x" }, 5);
    expect(href.match(/page=/g)).toHaveLength(1);
    expect(href).toContain("page=5");
  });

  it("keeps a repeated parameter repeated", () => {
    const href = hrefFor("/admin/leads", { tag: ["a", "b"] }, 2);
    expect(href).toContain("tag=a");
    expect(href).toContain("tag=b");
  });
});

describe("withoutPage", () => {
  it("is what a filter form submits, so a new search starts at the beginning", () => {
    expect(withoutPage({ q: "clinic", page: "6" })).toEqual({ q: "clinic" });
  });
});

describe("pageNumbers", () => {
  it("is just the page when there is one", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
  });

  it("shows every page while they fit", () => {
    expect(pageNumbers(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("marks a gap in a long list", () => {
    const shown = pageNumbers(10, 40);

    expect(shown[0]).toBe(1);
    expect(shown.at(-1)).toBe(40);
    expect(shown).toContain(10);
    expect(shown).toContain(null);
  });

  it("never draws a gap that hides a single page", () => {
    /* "1 … 3" is longer than "1 2 3" and hides a page for nothing. */
    const shown = pageNumbers(3, 20);
    const gapAt = shown.indexOf(null);

    if (gapAt > 0) {
      const before = shown[gapAt - 1] as number;
      const after = shown[gapAt + 1] as number;
      expect(after - before).toBeGreaterThan(2);
    }
  });

  it("never puts two gaps together", () => {
    for (const current of [1, 2, 5, 19, 20, 39, 40]) {
      const shown = pageNumbers(current, 40);
      for (const [index, page] of shown.entries()) {
        if (page === null) expect(shown[index + 1]).not.toBeNull();
      }
    }
  });

  it("keeps roughly the same width at both ends", () => {
    /* A control that visibly shrinks when somebody reaches the last page reads
       as something having gone wrong. */
    const start = pageNumbers(1, 40).length;
    const middle = pageNumbers(20, 40).length;
    const end = pageNumbers(40, 40).length;

    expect(Math.abs(start - middle)).toBeLessThanOrEqual(1);
    expect(Math.abs(end - middle)).toBeLessThanOrEqual(1);
  });
});

describe("describe", () => {
  it("counts rather than ranging when it all fits", () => {
    expect(summarise(resolve([1, 2, 3], 3, requestedPage({})))).toBe("3 records");
    expect(summarise(resolve([1], 1, requestedPage({})))).toBe("1 record");
  });

  it("gives the range when it does not", () => {
    /* The size is passed rather than left to the default, so this tests the
       range arithmetic and not whatever the page size happens to be today.
       It broke when the default moved from 25 to 10 — the behaviour was
       right and the expectation was pinned to a number it did not mean to
       assert. */
    expect(summarise(resolve([], 312, requestedPage({ page: "2" }, 25)))).toBe(
      "26–50 of 312",
    );
  });

  it("uses the page size the product asked for", () => {
    /* Ten, the owner's decision on 2026-09-02. Pinned deliberately in one
       place, so changing it is a decision rather than a surprise in eleven
       screens at once. */
    expect(PAGE_SIZE).toBe(10);
    expect(requestedPage({ page: "2" })).toMatchObject({ from: 10, to: 19 });
  });

  it("says so plainly when there is nothing", () => {
    expect(summarise(resolve([], 0, requestedPage({})))).toBe("Nothing to show");
  });
});
