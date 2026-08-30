import { cn } from "@/lib/utils";
import { percent } from "@/lib/utils";

/**
 * A percentage, drawn and said.
 *
 * The number is in the DOM as text as well as in the width of a bar, because a
 * bar alone tells a screen reader nothing and tells a person with low vision
 * very little. `role="progressbar"` with the three aria values is what makes it
 * announce as "62 percent" instead of as an empty div.
 *
 * Every percentage in this application is computed by the database — see
 * `20260829000004_portal_progress.sql`. Nothing here accepts a typed number.
 */
export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number | null | undefined;
  label: string;
  className?: string;
}) {
  const shown = percent(value);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="progressbar"
        aria-valuenow={shown}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-[--duration-slow] ease-[--ease-out]"
          style={{ width: `${shown}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-text-muted">
        {shown}%
      </span>
    </div>
  );
}
