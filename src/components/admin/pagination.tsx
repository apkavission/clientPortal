/*
 * Copied from the company website, deliberately.
 *
 * The estate's rule is that no project imports another's code, so a change
 * made there for its own reasons can never alter this one. These three copies
 * are kept in step by hand; there is no build step that can do it, and
 * pretending otherwise would be worse.
 */
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { describe, hrefFor, pageNumbers, type Paged, type Query } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/**
 * The control under a list.
 *
 * ---------------------------------------------------------------------------
 * **Links, not buttons.** Every page is a real address, so it can be opened in
 * a new tab, sent to somebody, and reached with the back button. A button that
 * calls `router.push` looks identical and does none of that.
 *
 * **Every other query parameter comes with it** — see `hrefFor`. Page two of a
 * search is page two of that search, not page two of everything.
 *
 * **It draws nothing when there is one page.** A pager under nine records is
 * furniture. The count line stays, because "9 records" is worth knowing and is
 * the thing somebody checks after filtering.
 */
export function Pagination({
  paged,
  pathname,
  query,
  className,
}: {
  paged: Paged<unknown>;
  /** The screen's own address — the links are built from it. */
  pathname: string;
  /** Everything currently in the address, so the links keep the search. */
  query: Query;
  className?: string;
}) {
  const summary = describe(paged);

  if (paged.pages <= 1) {
    return (
      <p className={cn("text-xs text-text-subtle", className)} data-testid="page-summary">
        {summary}
      </p>
    );
  }

  const previous = paged.page > 1 ? paged.page - 1 : null;
  const next = paged.page < paged.pages ? paged.page + 1 : null;

  return (
    <nav
      aria-label="Pages"
      data-testid="pagination"
      className={cn("flex flex-wrap items-center justify-between gap-3", className)}
    >
      <p className="text-xs text-text-subtle" data-testid="page-summary">
        {summary}
      </p>

      <ul className="flex items-center gap-1">
        <li>
          <Step
            href={previous ? hrefFor(pathname, query, previous) : null}
            label="Previous page"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Step>
        </li>

        {pageNumbers(paged.page, paged.pages).map((page, index) =>
          page === null ? (
            /*
              A gap, not a button. Marked `aria-hidden` because "…" read aloud
              between two page numbers is noise — the list is already announced
              as a set of pages.
            */
            <li
              key={`gap-${index}`}
              aria-hidden
              className="px-1 text-sm text-text-subtle"
            >
              …
            </li>
          ) : (
            <li key={page}>
              <Link
                href={hrefFor(pathname, query, page)}
                aria-label={`Page ${page}`}
                aria-current={page === paged.page ? "page" : undefined}
                className={cn(
                  "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-sm transition-colors",
                  page === paged.page
                    ? "bg-accent font-medium text-accent-fg"
                    : "text-text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                {page}
              </Link>
            </li>
          ),
        )}

        <li>
          <Step href={next ? hrefFor(pathname, query, next) : null} label="Next page">
            <ChevronRight className="size-4" aria-hidden />
          </Step>
        </li>
      </ul>
    </nav>
  );
}

/**
 * Previous and next.
 *
 * At the ends they become a `span` rather than a disabled link. A disabled
 * anchor is not a thing HTML has — `aria-disabled` on a link that still
 * navigates is worse than no control — so at the first page there is simply
 * nothing to press, drawn in place so the row does not shift.
 */
function Step({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const shape = "grid size-8 place-items-center rounded-lg";

  if (!href) {
    return (
      <span aria-hidden className={cn(shape, "text-text-subtle opacity-40")}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(shape, "text-text-muted transition-colors hover:bg-surface-2 hover:text-text")}
    >
      {children}
    </Link>
  );
}
