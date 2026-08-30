import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Class names, merged so the last one wins.
 *
 * `clsx` handles the conditionals; `twMerge` resolves Tailwind conflicts, so a
 * component can accept a `className` that overrides its own padding without the
 * caller having to know which utility came first in the string.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * A date as a person reads it. Never `toLocaleDateString` without a locale.
 *
 * The server and the browser can disagree about the ambient locale, and a date
 * that renders `29/08/2026` on one and `8/29/2026` on the other is a hydration
 * mismatch that only appears on somebody else's machine.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

/** A whole number of percent, clamped, for progress bars and labels. */
export function percent(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
