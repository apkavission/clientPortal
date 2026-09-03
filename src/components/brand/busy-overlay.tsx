"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { BrandLoader } from "@/components/brand/brand-loader";

/**
 * The application's busy state.
 *
 * `loading.tsx` covers what the router knows about — a navigation, a reload,
 * a segment fetching its data. It knows nothing about a write: a form posting,
 * a row being deleted, a draft being published. Those are the waits where a
 * person is most likely to click twice, and they need the same overlay.
 *
 * So anything that writes calls `start()` before and `stop()` after, or wraps
 * the call in `run()`, and the same lockup appears over the page — the page
 * itself still visible underneath, which is the point: nothing has been taken
 * away, something is in progress.
 *
 * Counted rather than boolean. Two writes can overlap — a save that triggers a
 * revalidation, an admin bulk action — and the first one to finish must not
 * clear the overlay while the second is still running.
 */

interface BusyContextValue {
  busy: boolean;
  /** Marks work as started. Returns the matching `stop`, so it cannot be lost. */
  start: (label?: string) => () => void;
  stop: () => void;
  /** Wraps a promise: the overlay covers exactly its lifetime, errors included. */
  run: <T>(work: Promise<T> | (() => Promise<T>), label?: string) => Promise<T>;
}

const BusyContext = createContext<BusyContextValue | null>(null);

export function BusyProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const [label, setLabel] = useState<string>("Working");
  const pending = useRef(0);

  const stop = useCallback(() => {
    pending.current = Math.max(0, pending.current - 1);
    setCount(pending.current);
  }, []);

  const start = useCallback((next?: string) => {
    pending.current += 1;
    if (next) setLabel(next);
    setCount(pending.current);

    // Returning the release rather than exposing only `stop()` means a caller
    // can never decrement someone else's work by accident.
    let released = false;
    return () => {
      if (released) return;
      released = true;
      pending.current = Math.max(0, pending.current - 1);
      setCount(pending.current);
    };
  }, []);

  const run = useCallback(
    async <T,>(work: Promise<T> | (() => Promise<T>), next?: string): Promise<T> => {
      const release = start(next);
      try {
        return await (typeof work === "function" ? work() : work);
      } finally {
        release();
      }
    },
    [start],
  );

  const value = useMemo(
    () => ({ busy: count > 0, start, stop, run }),
    [count, start, stop, run],
  );

  return (
    <BusyContext.Provider value={value}>
      {children}
      {count > 0 && <BrandLoader overlay size="md" label={label} showLabel />}
    </BusyContext.Provider>
  );
}

/**
 * Access to the busy overlay.
 *
 * Throws outside the provider rather than returning a no-op: a write that
 * silently shows no feedback is the failure this exists to prevent.
 */
export function useBusy(): BusyContextValue {
  const context = useContext(BusyContext);
  if (!context) {
    throw new Error("useBusy() must be used inside <BusyProvider>.");
  }
  return context;
}
