/**
 * Every screen this panel has.
 *
 * Declared as data rather than as markup so one list drives the sidebar, the
 * per-person permission checkboxes on the team screen, and the route guards.
 * Three copies of a menu drift, and the one that drifts is the one nobody looks
 * at.
 *
 * What this file says is which screens **exist**. Who reaches them is decided by
 * `lib/auth/menu.ts` from the person's role and their own two arrays.
 */

/**
 * A stable name for one screen.
 *
 * Stored in `staff.menu_extra` / `staff.menu_denied`, so these strings are a
 * small piece of schema: renaming one silently drops that screen from the menu
 * of everyone who had it granted or taken away. Rename the label instead — that
 * is what the label is for.
 */
export type MenuKey =
  | "dashboard"
  | "clients"
  | "projects"
  | "board"
  | "requests"
  | "team";

export interface NavItem {
  key: MenuKey;
  label: string;
  href: string;
  icon: string;
  /**
   * Screens only an owner or manager may open, and which cannot be handed out.
   *
   * `team` is one: giving somebody the team screen is giving them every other
   * screen, because they could raise their own role and take the rest. That is
   * not a grant, it is what being an owner means.
   */
  ownerOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard", href: "/", icon: "layout-dashboard" },
      { key: "board", label: "My board", href: "/board", icon: "kanban" },
    ],
  },
  {
    label: "Work",
    items: [
      { key: "clients", label: "Clients", href: "/clients", icon: "building" },
      { key: "projects", label: "Projects", href: "/projects", icon: "folder" },
      { key: "requests", label: "Requests", href: "/requests", icon: "inbox" },
    ],
  },
  {
    label: "Company",
    items: [
      { key: "team", label: "Team", href: "/team", icon: "users", ownerOnly: true },
    ],
  },
];

/** Every item, flattened, in the order they appear on screen. */
export const NAV_ITEMS: NavItem[] = NAV.flatMap((group) => group.items);

/** One item by its key, or undefined if the key is no longer declared. */
export function navItem(key: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.key === key);
}
