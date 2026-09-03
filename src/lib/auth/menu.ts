import { NAV, navItem, NAV_ITEMS, type MenuKey, type NavGroup, type NavItem } from "@/lib/nav";

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

/**
 * What one person may reach: the role's screens, plus and minus their own.
 *
 * `portal.staff` carried the role twice — the superseded enum and the key into
 * the master list. 20260830000014 added the key and called it the one that
 * counts, then left this file and `session.ts` still reading the enum, so the
 * transition was half done and load-bearing in the half that had supposedly
 * stopped mattering. Neither is read here now: the resolved default arrives
 * already looked up, from the master list.
 */
export interface MenuSubject {
  /**
   * The role's own screens, from `company.roles.portal_menu` through the
   * `roles_master` view — not a map in this repository.
   *
   * It was a `Record` here: six roles and their screens, in TypeScript. That
   * was fine while this application managed its own team. It stopped being
   * fine when the company admin took that over, because a per-person grant is
   * stored as a difference from the role's default and a screen over there
   * cannot subtract from a default it cannot see. Either that map got copied
   * into the website — a second list, kept in step by remembering to, which is
   * the thing this whole change removes — or it moved somewhere both can read.
   *
   * Empty is a real answer and the safe one: a role renamed or deleted in the
   * website leaves somebody reaching nothing, rather than reaching everything.
   */
  role_menu: string[] | null;
  menu_extra?: string[] | null;
  menu_denied?: string[] | null;
}

export function defaultMenuFor(roleMenu: string[] | null): MenuKey[] {
  return (roleMenu ?? [])
    .map((key) => navItem(key))
    .filter((item): item is NavItem => item !== undefined)
    .map((item) => item.key);
}

/**
 * Every screen that can be handed to one named person, in menu order.
 *
 * All of them, now. This was filtered by `ownerOnly`, which marked exactly one
 * item — the Team screen — because handing somebody the screen that hands out
 * screens is not a grant. That screen is gone: staff are managed in the
 * company website's admin, and this application no longer has a way to raise
 * anybody's authority from inside itself.
 */
export const GRANTABLE_ITEMS: NavItem[] = NAV_ITEMS;

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
  const menu = new Set<MenuKey>(defaultMenuFor(person.role_menu));

  for (const key of person.menu_extra ?? []) {
    const item = navItem(key);
    if (item) menu.add(item.key);
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
  roleMenu: string[] | null,
  wanted: string[],
): { menu_extra: string[]; menu_denied: string[] } {
  const chosen = new Set(wanted);
  const byDefault = new Set(defaultMenuFor(roleMenu));

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

/**
 * What a role is called, for a header that has to say it in one word.
 *
 * A small map rather than a lookup in `company.roles`, where the labels are
 * actually edited. Reading the master list would mean a cross-schema query on
 * every page render to render one subtitle, and the dependency this panel
 * takes on that table is deliberately one column of one row.
 *
 * An unknown key is printed rather than hidden — a person whose role was
 * renamed should see something true and slightly odd, not a blank space that
 * says nothing about why their menu changed.
 */
const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  manager: "Manager",
  developer: "Developer",
  designer: "Designer",
  qa: "QA",
};

export function roleLabel(roleKey: string | null): string {
  if (!roleKey) return "No role";
  return ROLE_LABEL[roleKey] ?? roleKey.replace(/_/g, " ");
}
