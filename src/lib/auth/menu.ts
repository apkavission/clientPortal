import { NAV, navItem, NAV_ITEMS, type MenuKey, type NavGroup, type NavItem } from "@/lib/nav";
import type { StaffRole } from "@/types/database";

/**
 * What one person may reach, resolved.
 *
 * Not server-only, and it must not become so: the team screen builds its grant
 * checkboxes from these same functions in the browser, and a second
 * implementation of "what does this person see" is the bug this file exists to
 * prevent.
 *
 * The model, which is the company website's: **a menu is a permission, and it is
 * per person.** A role carries a default. An individual may be given extras
 * beyond it, or have items taken away from it.
 *
 * Hiding a link is never the mechanism. `requireMenu()` checks this on the
 * server for every screen, and row-level security refuses the rows underneath
 * regardless of both. Three layers, and the sidebar is the weakest by design.
 */

/** The screens a role reaches before anything is said about the person. */
const ROLE_MENU: Record<StaffRole, MenuKey[]> = {
  // Everything, including the screen that hands out everything.
  owner: ["dashboard", "board", "clients", "projects", "requests", "team"],
  manager: ["dashboard", "board", "clients", "projects", "requests", "team"],

  /*
    Everything except the team screen.

    An admin can run the work — clients, projects, the queue — and cannot change
    who else can. That is the line worth drawing: access to the work does not
    imply access to who has access.
  */
  developer: ["dashboard", "board", "projects", "requests"],
  designer: ["dashboard", "board", "projects"],
  qa: ["dashboard", "board", "projects"],
};

export interface MenuSubject {
  role: StaffRole;
  menu_extra?: string[] | null;
  menu_denied?: string[] | null;
}

export function defaultMenuFor(role: StaffRole): MenuKey[] {
  return (ROLE_MENU[role] ?? [])
    .map((key) => navItem(key))
    .filter((item): item is NavItem => item !== undefined)
    .filter((item) => !item.ownerOnly || role === "owner" || role === "manager")
    .map((item) => item.key);
}

/**
 * Can this screen be handed to one named person?
 *
 * `team` is refused always — it is what being an owner means rather than an
 * extra to be given out, and the policies on `portal.staff` would refuse every
 * action on it anyway.
 */
export function isGrantable(item: NavItem): boolean {
  return !item.ownerOnly;
}

/** Every screen an owner may hand out or take away, in menu order. */
export const GRANTABLE_ITEMS: NavItem[] = NAV_ITEMS.filter(isGrantable);

/**
 * The screens this person may reach.
 *
 * Order matters and is deliberate: the role default, then the extras, then the
 * removals. **Taken away wins**, so a mistake that grants and revokes the same
 * screen fails closed. The database refuses to hold both at once
 * (`staff_menu_disjoint`), so this is the second answer to a question that
 * should never be asked — which is the right number of answers for a
 * permission.
 */
export function resolveMenu(person: MenuSubject): Set<MenuKey> {
  const menu = new Set<MenuKey>(defaultMenuFor(person.role));

  for (const key of person.menu_extra ?? []) {
    const item = navItem(key);
    // `ownerOnly` is enforced here as well as in the form that writes it: a row
    // edited straight into the database is still a row this code reads.
    if (item && isGrantable(item)) menu.add(item.key);
  }

  for (const key of person.menu_denied ?? []) {
    const item = navItem(key);
    if (item) menu.delete(item.key);
  }

  return menu;
}

/** Whether one screen is reachable. The question every page asks. */
export function canReach(person: MenuSubject, key: MenuKey): boolean {
  return resolveMenu(person).has(key);
}

/** The menu as this person sees it. Empty groups are dropped. */
export function navFor(person: MenuSubject): NavGroup[] {
  const menu = resolveMenu(person);

  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => menu.has(item.key)),
  })).filter((group) => group.items.length > 0);
}

/**
 * A resolved menu expressed as the two stored arrays.
 *
 * The team screen shows one checkbox per screen; what has to be stored is how
 * that differs from the role default. Doing the subtraction here rather than in
 * the form is what lets a role change and a menu change be saved together: the
 * difference is recomputed against the role being saved, not the one that was on
 * screen when the page loaded.
 */
export function menuOverrides(
  role: StaffRole,
  wanted: string[],
): { menu_extra: string[]; menu_denied: string[] } {
  const chosen = new Set(wanted);
  const byDefault = new Set(defaultMenuFor(role));

  const extra: string[] = [];
  const denied: string[] = [];

  for (const item of GRANTABLE_ITEMS) {
    const has = chosen.has(item.key);
    const had = byDefault.has(item.key);

    if (has && !had) extra.push(item.key);
    if (!has && had) denied.push(item.key);
  }

  return { menu_extra: extra, menu_denied: denied };
}
