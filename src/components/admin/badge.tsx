import { cn } from "@/lib/utils";

/**
 * A small coloured word.
 *
 * The tone is chosen by the caller rather than derived from the text, because
 * the same word means different things in different places: "blocked" on a task
 * is a warning, "declined" on a request is simply an answer.
 *
 * Colour is never the only carrier — the word itself is always there. A badge
 * that says nothing without its colour is a badge that says nothing to about
 * one man in twelve.
 */

const TONES = {
  neutral: "bg-surface-2 text-text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
