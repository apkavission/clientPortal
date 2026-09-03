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
  | "requests";

export interface NavItem {
  key: MenuKey;
  label: string;
  href: string;
  icon: string;
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
  /*
    There was a "Company" group here, holding the Team screen.

    Staff are managed in the company website's admin now — one list of people
    instead of two kept in step by remembering to, which is what the comment on
    `portal.staff` warned about from the day it was written. The screen that
    handed out access from here is gone with it, and so is `ownerOnly`: it
    existed to mark exactly one item, and marking none is a rule that no longer
    needs stating.
  */
];

/** Every item, flattened, in the order they appear on screen. */
export const NAV_ITEMS: NavItem[] = NAV.flatMap((group) => group.items);

/** One item by its key, or undefined if the key is no longer declared. */
export function navItem(key: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.key === key);
}
