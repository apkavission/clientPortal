import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-loader";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { MobileNav } from "@/components/admin/mobile-nav";
import { Sidebar } from "@/components/admin/sidebar";
import { ThemeToggle } from "@/components/admin/theme-toggle";
import type { NavGroup } from "@/lib/nav";

/**
 * The panel: a rail on the left, a header across the top, the screen in the
 * middle.
 *
 * The groups are resolved on the server from this person's role and their own
 * two arrays, and handed down. Nothing in the browser decides what a person may
 * see — the rail draws what it is given, `requireMenu()` refuses the route, and
 * row-level security refuses the rows.
 *
 * The rail collapses to a drawer below `lg`. Not hidden — a panel somebody
 * cannot navigate on a phone is a panel they will not open on a phone, and the
 * whole point of this one is that it gets used on the way somewhere.
 */
export function Shell({
  groups,
  who,
  role,
  children,
}: {
  groups: NavGroup[];
  who: string;
  /** The signed-in person's role, so it is visible rather than inferred. */
  role: string;
  children: React.ReactNode;
}) {
  return (
    /*
      The shell holds still; the content scrolls inside it.

      It was `min-h-dvh`, so the whole page scrolled as one — the rail and the
      header slid away with the content, and a long project screen showed two
      scrollbars: the window's and, on any panel with its own overflow, that
      panel's. The tracker was given this same treatment on 2026-09-02.
    */
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface lg:flex">
        <div className="flex h-24 items-center border-b border-border px-5">
          <Link href="/" aria-label="Dashboard">
            <BrandMark height={72} />
          </Link>
        </div>
        <Sidebar groups={groups} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-24 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
          <div className="lg:hidden">
            <MobileNav groups={groups} />
          </div>

          <Link href="/" className="lg:hidden" aria-label="Dashboard">
            <BrandMark height={60} />
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {/* Name and role together. Which role somebody holds decides what
                they can see, so it belongs on screen rather than in their
                memory — and when a menu looks wrong this is the first thing
                worth checking. */}
            <span className="hidden text-right leading-tight sm:block">
              <span className="block text-sm text-text-muted">{who}</span>
              <span className="block font-mono text-[0.65rem] uppercase tracking-[0.12em] text-text-subtle">
                {role}
              </span>
            </span>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>

        {/*
          The only thing on the page that scrolls.

          Padding is on an inner div rather than here, so a screen that wants
          the full height can set `h-full` on its own root without fighting a
          padded box.
        */}
        <main className="relative flex-1 overflow-y-auto">
          <div className="h-full px-4 py-8 sm:px-6 lg:px-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
