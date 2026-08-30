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
  children,
}: {
  groups: NavGroup[];
  who: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Link href="/" aria-label="Dashboard">
            <BrandMark height={36} />
          </Link>
        </div>
        <Sidebar groups={groups} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
          <div className="lg:hidden">
            <MobileNav groups={groups} />
          </div>

          <Link href="/" className="lg:hidden" aria-label="Dashboard">
            <BrandMark height={30} />
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-text-muted sm:inline">{who}</span>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>

        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
