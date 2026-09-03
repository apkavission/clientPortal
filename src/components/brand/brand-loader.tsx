import { cn } from "@/lib/utils";

/**
 * The loader. This one, everywhere.
 *
 * A standing instruction from the owner, and it binds this project as much as
 * the company website: **one loader across the estate** — the mark, the words
 * arriving from the left and the right, and the rising arrow drawing itself
 * underneath.
 *
 * **The first version of this file got that wrong.** It rendered the name as
 * text with an animation of my own devising and no logo at all. That was two
 * mistakes: it changed something that was already settled, and it dropped the
 * mark. This is the company website's loader, reproduced — same structure, same
 * keyframes, same easing, same arrow.
 *
 * Written again here rather than imported, because this application must not
 * depend on the website. The cost of that decision is exactly this file and the
 * four SVGs in `public/brand/`, kept in step by hand.
 *
 * **One thing is deliberately absent**: the company site puts a small WebGL
 * field behind the lockup on its full-screen loader. That needs three.js, which
 * is a large dependency for atmosphere on a screen nobody is meant to look at
 * for long, so it is not here. Everything a person actually recognises — the
 * mark, the entrance, the breathing, the arrow — is.
 */

const WORD_SIZE = {
  sm: "text-base",
  md: "text-xl sm:text-2xl",
  lg: "text-2xl sm:text-4xl",
} as const;

const MARK_SIZE = {
  sm: "h-5",
  md: "h-7 sm:h-9",
  lg: "h-10 sm:h-14",
} as const;

const GAP = {
  sm: "gap-2",
  md: "gap-3 sm:gap-4",
  lg: "gap-3 sm:gap-6",
} as const;

export type BrandLoaderSize = keyof typeof WORD_SIZE;

export function BrandLoader({
  overlay = false,
  size = "md",
  label = "Loading",
  showLabel = false,
  words = ["Apka", "Vission"],
  children,
  className,
}: {
  /** Lays the loader over the page rather than replacing it. */
  overlay?: boolean;
  size?: BrandLoaderSize;
  label?: string;
  showLabel?: boolean;
  /** The name, split at the centre, so the mark sits between the halves. */
  words?: [string, string];
  /** A message and a way out, for the screens that reuse this treatment. */
  children?: React.ReactNode;
  className?: string;
}) {
  const [left, right] = words;

  return (
    <div
      role="status"
      aria-live="polite"
      // A screen that has finished failing is not busy. `children` is what
      // separates the two: a wait has none.
      aria-busy={children ? undefined : true}
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden",
        overlay
          ? cn(
              // `min-h-dvh` rather than `h-screen`: on a phone the browser
              // chrome changes the viewport height mid-wait, and `dvh` follows.
              "fixed inset-0 z-[70] min-h-dvh overflow-y-auto px-6 py-16",
              // Translucent, so the page stays readable underneath and the wait
              // feels like a pause rather than a reset.
              "bg-bg/75 backdrop-blur-sm supports-[backdrop-filter]:bg-bg/60",
            )
          : "w-full px-6 py-16",
        className,
      )}
    >
      <div className="relative flex items-center justify-center">
        <div className={cn("relative flex items-center", GAP[size])}>
          <span
            className={cn(
              "font-semibold tracking-tight text-text",
              WORD_SIZE[size],
              "[animation:brand-word-left_var(--duration-slow)_var(--ease-out)_both]",
            )}
          >
            {left}
          </span>

          {/* Above the words in the stack, which is what lets them appear to
              come out from behind the mark rather than slide past it. */}
          <span
            className={cn(
              "relative z-10 [animation:brand-mark-in_var(--duration-base)_var(--ease-out)_both]",
              MARK_SIZE[size],
            )}
          >
            {/* The breathing loop is a child of the entrance, so the two do not
                fight over the same transform. */}
            <span className="block size-full [animation:brand-breathe_1.6s_ease-in-out_infinite] [animation-delay:var(--duration-slow)]">
              <BrandSymbol className="h-full w-auto" />
            </span>
          </span>

          <span
            className={cn(
              "font-semibold tracking-tight text-text",
              WORD_SIZE[size],
              "[animation:brand-word-right_var(--duration-slow)_var(--ease-out)_both]",
            )}
          >
            {right}
          </span>
        </div>
      </div>

      <VisionArrow className="relative mt-7" />

      {showLabel && (
        <p className="relative mt-5 font-mono text-xs uppercase tracking-[0.18em] text-text-subtle">
          {label}
        </p>
      )}

      {children && <div className="relative mt-10 w-full max-w-2xl">{children}</div>}

      {/* Always announced, whether or not it is drawn. */}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * The symbol, correct in both themes.
 *
 * Both files are emitted and CSS hides one, exactly as the company site does.
 * Choosing in JavaScript would mean either a flash of the wrong mark or a
 * loader that stays blank until hydration — on the one screen that exists
 * precisely because hydration has not happened yet.
 */
export function BrandSymbol({ className }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a committed SVG
          of known size from our own origin; there is nothing for the optimiser
          to do, and this must never be deferred. */}
      <img
        src="/brand/symbol-light.svg"
        alt=""
        aria-hidden
        className={cn("theme-light-only", className)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img
        src="/brand/symbol-dark.svg"
        alt=""
        aria-hidden
        className={cn("theme-dark-only", className)}
      />
    </>
  );
}

/**
 * The company logo, at rest. What the header and the sign-in screen show.
 *
 * **The logo file, not the name in text.** The first version of this component
 * wrote "Apka Vission" as two styled words, which is not the brand — it is a
 * description of it. The owner's rule across the estate is the actual mark,
 * everywhere it appears, in every project.
 *
 * The same four SVGs the company website uses, copied into `public/brand/`
 * rather than imported, because this application must not depend on that one.
 *
 * Both themes are emitted and CSS hides one, so the correct mark is painted in
 * the first frame — no hydration, no flash, and it survives JavaScript being
 * off. Width is given explicitly so the header does not reflow when the SVG
 * lands; it comes from the file's own 1246 x 764.
 */
export function BrandMark({
  height = 44,
  className,
}: {
  height?: number;
  className?: string;
}) {
  const width = Math.round((1246 / 764) * height);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- an SVG of known
          size from our own origin, and the one image that must never be
          deferred. */}
      <img
        src="/brand/logo-light.svg"
        alt="Apka Vission"
        width={width}
        height={height}
        style={{ height, width }}
        className={cn("theme-light-only", className)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img
        src="/brand/logo-dark.svg"
        alt="Apka Vission"
        width={width}
        height={height}
        style={{ height, width }}
        className={cn("theme-dark-only", className)}
      />
    </>
  );
}

/**
 * The rising arrow from the mark, drawn as a stroke so it can animate.
 *
 * `pathLength={100}` normalises the dash values, so the shaft and the two barbs
 * draw in proportion whatever the coordinates are.
 */
function VisionArrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 44"
      aria-hidden
      className={cn("h-6 w-28 text-accent sm:w-36", className)}
      fill="none"
    >
      <path
        d="M6 38 L74 10 M74 10 L54 10 M74 10 L74 28"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
        strokeDasharray={100}
        className="[animation:brand-arrow-draw_2.4s_ease-in-out_infinite]"
      />
    </svg>
  );
}

/**
 * The compact form: a wait that happens in place.
 *
 * Buttons mid-submit, a row being saved. Same accent, same easing, no lockup —
 * at this size the name would be illegible and the mark unreadable, so the arc
 * carries the brand through colour alone.
 *
 * `aria-hidden` because the button's own label already changes to "Saving";
 * announcing the spinner as well says the same thing twice.
 */
export function BrandSpinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full",
        "border-2 border-current/30 border-t-current",
        className,
      )}
    />
  );
}
