import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The button, in three weights.
 *
 * One component rather than a class string copied around, because the focus
 * ring and the disabled state are the two things everybody forgets and they are
 * the two that matter most: a button nobody can tab to is a button that does
 * not exist for a keyboard, and a button that still looks pressable while it is
 * saving gets pressed twice.
 */

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium " +
  "transition-colors duration-[--duration-fast] " +
  "disabled:pointer-events-none disabled:opacity-55";

const VARIANTS = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-border-strong bg-surface text-text hover:bg-surface-2",
  quiet: "text-text-muted hover:bg-surface-2 hover:text-text",
  danger: "bg-danger text-white hover:opacity-90",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={cn(BASE, VARIANTS[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cn(BASE, VARIANTS[variant], className)} {...props} />;
}
