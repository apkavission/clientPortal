"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AlertTriangle, Info, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one confirmation dialog.
 *
 * `window.confirm` is never used anywhere in this estate. It is unstyled, it
 * ignores the theme, it names the origin rather than the company, its buttons
 * say "OK" and "Cancel" whatever the question was, and on some platforms it
 * carries a "prevent this page from creating more dialogs" checkbox that can
 * disable every later confirmation on the page. A destructive action deserves
 * better than a browser artefact.
 *
 * Same shape as the toast, deliberately: one component, mounted once in the
 * root layout, reached through a hook, with every colour coming from the theme
 * tokens so it is correct in light and dark with no second set of styles.
 *
 * Built on the native `<dialog>` element with `showModal()`, which gives the
 * things a hand-rolled overlay usually gets wrong: focus is trapped inside it,
 * Escape closes it, the rest of the page is inert to a screen reader, and it
 * renders in the browser's top layer so no `z-index` can cover it.
 */

export type ConfirmTone = "danger" | "warning" | "info";

export interface ConfirmOptions {
  title: string;
  /** One or two sentences. Say what will happen, and whether it can be undone. */
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

const TONE: Record<
  ConfirmTone,
  { icon: typeof Trash2; accent: string; surface: string; button: string }
> = {
  danger: {
    icon: Trash2,
    accent: "text-danger",
    surface: "border-danger/35 bg-danger-soft",
    button: "bg-danger text-white hover:brightness-110",
  },
  warning: {
    icon: AlertTriangle,
    accent: "text-warning",
    surface: "border-warning/35 bg-warning-soft",
    button: "bg-warning text-warning-fg hover:brightness-110",
  },
  info: {
    icon: Info,
    accent: "text-accent",
    surface: "border-accent/35 bg-accent-soft",
    button: "bg-accent text-accent-fg hover:bg-accent-hover",
  },
};

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (answer: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending({ options, resolve });
      }),
    [],
  );

  // `showModal()` has to be called on the element, not expressed as a prop, so
  // this is the one place an effect is the correct tool rather than a smell.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (pending && !element.open) element.showModal();
    if (!pending && element.open) element.close();
  }, [pending]);

  const answer = useCallback(
    (result: boolean) => {
      setPending((current) => {
        current?.resolve(result);
        return null;
      });
    },
    [],
  );

  const tone = TONE[pending?.options.tone ?? "danger"];
  const Icon = tone.icon;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <dialog
        ref={dialog}
        /* Escape fires `cancel`, and a dismissal is a "no" like any other. */
        onCancel={(event) => {
          event.preventDefault();
          answer(false);
        }}
        /* Clicking the backdrop lands on the dialog element itself; a click
           on anything inside it lands on a child. */
        onClick={(event) => {
          if (event.target === dialog.current) answer(false);
        }}
        aria-labelledby="confirm-title"
        aria-describedby={pending?.options.body ? "confirm-body" : undefined}
        className={cn(
          "m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border",
          "bg-surface p-0 text-text shadow-[var(--shadow-3)]",
          "backdrop:bg-overlay backdrop:backdrop-blur-sm",
        )}
      >
        {pending && (
          <div className="p-6">
            <div className="flex gap-4">
              <span
                aria-hidden
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-xl border",
                  tone.surface,
                  tone.accent,
                )}
              >
                <Icon className="size-5" />
              </span>

              <div className="min-w-0 flex-1">
                <h2 id="confirm-title" className="font-display text-base font-semibold">
                  {pending.options.title}
                </h2>
                {pending.options.body && (
                  <p
                    id="confirm-body"
                    className="mt-2 text-sm leading-relaxed text-text-muted"
                  >
                    {pending.options.body}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {/*
                Cancel takes the focus, not confirm. The confirming half is the
                irreversible one, and a dialog that acts on a stray Enter is how
                a section nobody meant to delete disappears.
              */}
              <button
                type="button"
                autoFocus
                onClick={() => answer(false)}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-border-strong bg-surface px-5 text-sm font-medium transition-colors hover:bg-surface-2"
              >
                {pending.options.cancelLabel ?? "Cancel"}
              </button>

              <button
                type="button"
                onClick={() => answer(true)}
                className={cn(
                  "inline-flex h-11 items-center justify-center rounded-lg px-5 text-sm font-medium",
                  "transition-[background-color,filter] duration-[--duration-fast] active:scale-[0.98]",
                  tone.button,
                )}
              >
                {pending.options.confirmLabel ?? "Delete"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Ask before doing something that cannot be undone.
 *
 * Returns a promise that resolves to the answer, so a caller reads as the
 * question it is asking:
 *
 *     if (!(await confirm({ title: "Delete this section?" }))) return;
 *
 * Throws outside the provider rather than falling back to `window.confirm`:
 * a silent fallback is how the browser dialog creeps back in.
 */
export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm() must be used inside <ConfirmProvider>.");
  }
  return context;
}
