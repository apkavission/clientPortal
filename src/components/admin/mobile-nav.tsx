"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/admin/sidebar";
import type { NavGroup } from "@/lib/nav";

/**
 * The rail, as a drawer, below `lg`.
 *
 * A native `<dialog>` was considered and not used: this is navigation rather
 * than a decision, and trapping focus in it would mean a person cannot tab
 * straight past it to the page. Escape closes, the backdrop closes, and every
 * link closes it on the way out — which is the behaviour people expect from a
 * menu rather than from a modal.
 */
export function MobileNav({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the menu"
        aria-expanded={open}
        className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close the menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-overlay"
          />

          <div
            className="absolute inset-y-0 left-0 w-64 overflow-y-auto border-r border-border bg-surface"
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
          >
            <div className="flex h-24 items-center justify-end border-b border-border px-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close the menu"
                className="rounded-lg p-2 text-text-muted hover:bg-surface-2 hover:text-text"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <Sidebar groups={groups} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
