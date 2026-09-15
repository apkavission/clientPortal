/**
 * How every screen in this application opens.
 *
 * Thirteen screens in the portal and nineteen in the tracker each wrote their
 * own heading. They were all `h1` and a paragraph, and they were all slightly
 * different: some had the action button above the heading, some below, some
 * beside it; the sentence under the title was sometimes `text-sm text-muted`
 * and sometimes not there at all. Nobody would call any one of them wrong, and
 * together they read as thirty-two pages built by thirty-two people.
 *
 * So: one shape.
 *
 * - **`section`** — the part of the system this screen belongs to, in the same
 *   small mono caps the rail uses for its group labels. It is not decoration;
 *   it is the answer to "where am I", which in an application with a rail that
 *   scrolls is a real question. Defaults to nothing, because the dashboard is
 *   not inside anything.
 * - **`title`** — the screen's name, matching the rail's word for it. When they
 *   differ, somebody clicks the rail and lands somewhere they think is not the
 *   place they clicked.
 * - **`lede`** — one sentence on what the screen is for, held to `measure` so
 *   it never runs the width of a 1440px window.
 * - **`actions`** — what you can do from here, on the right on a wide screen
 *   and under the heading on a narrow one. Always in the same corner, so the
 *   button somebody wants is where their hand already is.
 *
 * The rule under the title draws itself once when the page arrives. That is the
 * only motion on a working surface anywhere in this application, and it is the
 * reason a navigation reads as opening a page rather than swapping one.
 */
export function PageHead({
  section,
  title,
  lede,
  actions,
}: {
  /** The part of the system this screen is in. Omitted on the dashboard. */
  section?: string;
  title: string;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="enter flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {section && <p className="micro mb-2">{section}</p>}

        {/*
          `head-rule` hangs a short accent rule below the heading. It is on the
          heading rather than on a sibling so it cannot drift out of alignment
          with the text when the title wraps to two lines.
        */}
        <h1 className="head-rule text-2xl font-semibold tracking-[-0.01em] sm:text-[1.75rem]">
          {title}
        </h1>

        {lede && (
          <p className="measure mt-7 text-sm leading-relaxed text-text-muted">
            {lede}
          </p>
        )}
      </div>

      {/* `shrink-0` so a long title never squeezes a button into two lines of
          broken words; it wraps the whole cluster onto its own row instead. */}
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
