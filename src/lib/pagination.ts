/*
 * Copied from the company website, deliberately.
 *
 * The estate's rule is that no project imports another's code, so a change made
 * there for its own reasons can never alter this one. These three copies are
 * kept in step by hand — `npm run check:copies` in the website is what reports
 * when they stop agreeing, because "by hand" is exactly the part that fails.
 */
/**
 * Pagination, driven by the address bar.
 *
 * ---------------------------------------------------------------------------
 * **The page is a query parameter, not state.**
 *
 * So a link to page four is a link to page four: it can be sent to somebody,
 * opened in a new tab, bookmarked, and it survives a refresh. A `useState`
 * version is shorter and loses the reader's place every time they open a record
 * and come back.
 *
 * **Every other parameter is carried through.** A search, a status filter, a
 * sort — whatever is in the address stays in it when the page changes, because
 * "page 2 of the results I am looking at" is the only useful meaning of page 2.
 * That is `hrefFor` below, and it is the whole reason this is a module rather
 * than three lines in each screen.
 *
 * **Changing a filter goes back to page one.** Not done here — a filter form
 * simply does not carry `page` — but it is the other half of the same rule, and
 * `withoutPage` exists so a form can say so in one call.
 *
 * ---------------------------------------------------------------------------
 * **A page past the end shows the last page, not nothing.**
 *
 * Search for something on page seven, narrow it to two pages, and the address
 * still says seven. Answering with an empty list is technically correct and
 * reads as "your search found nothing" — which is wrong, and the reader has no
 * way to tell the difference. `resolve` clamps instead.
 */

/**
 * How many rows a screen shows before it needs a second page.
 *
 * Ten, the owner's decision on 2026-09-02. It is a small number for a table
 * and the right one for these screens: most of them are read on a phone, and a
 * page somebody has to scroll through is a page they stop reading before the
 * end of.
 */
export const PAGE_SIZE = 10;

export type Query = Record<string, string | string[] | undefined>;

export interface PageRequest {
  /** One-based, as it is written in the address and read by a person. */
  page: number;
  size: number;
  /** Inclusive bounds for a range query, zero-based as the database wants. */
  from: number;
  to: number;
}

/**
 * What page was asked for.
 *
 * Anything that is not a whole number above zero is page one — a hand-edited
 * address, a stale link, `?page=abc`. It is a list of records, not a form: it
 * should show something rather than complain.
 */
export function requestedPage(query: Query, size: number = PAGE_SIZE): PageRequest {
  const raw = typeof query.page === "string" ? Number.parseInt(query.page, 10) : 1;
  const page = Number.isFinite(raw) && raw > 0 ? raw : 1;

  return { page, size, from: (page - 1) * size, to: page * size - 1 };
}

export interface Paged<T> {
  rows: T[];
  /** How many rows match, ignoring the page. Null when it could not be counted. */
  total: number | null;
  page: number;
  size: number;
  pages: number;
}

/**
 * A page of rows, with the page clamped to what actually exists.
 *
 * Given the total, this says which page is really being shown — so a screen can
 * ask for page seven of a two-page list and draw page two, with the controls
 * agreeing.
 */
export function resolve<T>(
  rows: T[],
  total: number | null,
  request: PageRequest,
): Paged<T> {
  const pages = total === null ? 1 : Math.max(1, Math.ceil(total / request.size));

  return {
    rows,
    total,
    page: Math.min(request.page, pages),
    size: request.size,
    pages,
  };
}

/**
 * The address for another page of the same list.
 *
 * Everything else in the query is kept. Page one drops the parameter entirely,
 * so the first page of a list has one address rather than two — which matters
 * for anything that compares them, and for anybody reading the URL.
 */
export function hrefFor(pathname: string, query: Query, page: number): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (key === "page" || value === undefined) continue;

    /* A repeated parameter is an array here. Kept as several entries rather
       than joined, because that is what it was. */
    for (const one of Array.isArray(value) ? value : [value]) params.append(key, one);
  }

  if (page > 1) params.set("page", String(page));

  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/**
 * The same query with the page dropped.
 *
 * For a filter or a search form: submitting one has to land on page one,
 * because page seven of a different set of results is meaningless.
 */
export function withoutPage(query: Query): Query {
  const rest: Query = {};
  for (const [key, value] of Object.entries(query)) {
    if (key !== "page") rest[key] = value;
  }
  return rest;
}

/**
 * Which page numbers to draw.
 *
 * ---------------------------------------------------------------------------
 * A list of forty pages cannot show forty buttons. This gives first, last, the
 * current page and its neighbours, with gaps marked — the shape everybody
 * already knows:
 *
 *     1 … 6 [7] 8 … 40
 *
 * `null` is a gap. It is returned rather than the string "…" so the component
 * decides how a gap looks, and so two adjacent gaps cannot happen.
 *
 * The window widens at the ends, so page 1 shows `1 2 3 … 40` rather than
 * `1 2 … 40` — a first page with two neighbours and a last page with none reads
 * as broken.
 */
export function pageNumbers(current: number, pages: number, around = 1): (number | null)[] {
  if (pages <= 1) return [1];

  const wanted = new Set<number>([1, pages]);

  for (let page = current - around; page <= current + around; page += 1) {
    if (page >= 1 && page <= pages) wanted.add(page);
  }

  /* Keep the count steady near the ends, so the control does not visibly
     shrink when somebody reaches the first or last page. */
  if (current <= around + 2) {
    for (let page = 1; page <= Math.min(around * 2 + 3, pages); page += 1) wanted.add(page);
  }
  if (current >= pages - around - 1) {
    for (let page = Math.max(1, pages - around * 2 - 2); page <= pages; page += 1) {
      wanted.add(page);
    }
  }

  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];

  for (const [index, page] of sorted.entries()) {
    const previous = sorted[index - 1];
    /* A gap of exactly one is drawn as that page rather than as an ellipsis:
       "1 … 3" is longer than "1 2 3" and hides a page for no reason. */
    if (previous !== undefined && page - previous === 2) out.push(previous + 1);
    else if (previous !== undefined && page - previous > 2) out.push(null);

    out.push(page);
  }

  return out;
}

/** "Showing 26–50 of 312", for the line under a list. */
export function describe(paged: Paged<unknown>): string {
  if (paged.total === null) return `Page ${paged.page}`;
  if (paged.total === 0) return "Nothing to show";

  const first = (paged.page - 1) * paged.size + 1;
  const last = Math.min(paged.page * paged.size, paged.total);

  if (paged.total <= paged.size) {
    return `${paged.total} ${paged.total === 1 ? "record" : "records"}`;
  }

  return `${first}–${last} of ${paged.total}`;
}
