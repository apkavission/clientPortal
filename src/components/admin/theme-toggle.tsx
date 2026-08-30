"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Light or dark, remembered.
 *
 * Read with `useSyncExternalStore` rather than an effect, and that is not
 * stylistic. An effect that sets state on mount runs *after* hydration, so the
 * first paint uses the server's guess and the second uses the browser's — which
 * is a visible flip of the whole page. This subscribes to the attribute the
 * blocking script in the layout has already set, so the first render is
 * correct.
 *
 * The server snapshot is "light" because the server genuinely cannot know. The
 * inline script has already put the right value on <html> before this component
 * exists, so that guess is never painted.
 */

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function current(): "light" | "dark" {
  if (document.documentElement.getAttribute("data-theme") === "dark") return "dark";
  if (document.documentElement.getAttribute("data-theme") === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, current, () => "light" as const);
  const next = mode === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      aria-label={`Switch to the ${next} theme`}
      onClick={() => {
        document.documentElement.setAttribute("data-theme", next);
        try {
          localStorage.setItem("portal-theme", next);
        } catch {
          // A private window. The choice applies for this page either way.
        }
      }}
      className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      {mode === "dark" ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </button>
  );
}
