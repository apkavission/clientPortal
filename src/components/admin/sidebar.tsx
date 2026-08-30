"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { NavGroup } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The rail.
 *
 * Given the groups already resolved on the server, so this component never
 * decides who sees what — it draws what it is handed. A sidebar that filtered
 * for itself would be a second answer to a question the server has already
 * answered, and the two would drift.
 *
 * `aria-current="page"` rather than colour alone: the active item has to be
 * announced, not only shaded.
 */
export function Sidebar({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className="flex flex-col gap-6 p-4">
      {groups.map((group) => (
        <div key={group.label}>
          <h2 className="px-3 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-text-subtle">
            {group.label}
          </h2>

          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent-soft font-semibold text-accent shadow-[inset_3px_0_0_var(--accent)]"
                        : "text-text-muted hover:bg-surface-2 hover:text-text",
                    )}
                  >
                    <Icon name={item.icon} className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
