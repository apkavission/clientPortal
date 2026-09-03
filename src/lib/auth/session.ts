import "server-only";

import { notFound, redirect } from "next/navigation";
import { canReach } from "@/lib/auth/menu";
import type { MenuKey } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import type { StaffRow } from "@/types/database";

/**
 * Who is asking.
 *
 * This application is the company's own panel, so there is exactly one kind of
 * person who belongs here: an active member of staff. Anybody else — a client
 * login, an auth account with no staff row, somebody who has been made inactive
 * — reaches nothing, and is told so on a page rather than bounced around.
 *
 * Three layers, and this is the middle one. `proxy.ts` turns signed-out requests
 * away before a page renders; row-level security decides which rows come back
 * whatever this file concludes.
 */

/** A staff row with the role's own screens already resolved onto it. */
export type StaffWithMenu = StaffRow & { role_menu: string[] | null };

export interface StaffSession {
  userId: string;
  email: string | null;
  staff: StaffWithMenu;
  /** The master role, or null if theirs was renamed or deleted. */
  role: { key: string; label: string; isOwner: boolean } | null;
}

/** The signed-in staff member, or null. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("staff")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data || !data.is_active) return null;

  /*
    The master role, by key, for its label and the screens it reaches.

    `portal.roles_master` is a read-only view onto `company.roles` — one
    direction, no foreign key — so the website can rename a role or change what
    it opens without a migration here.

    Null is a real state and is handled rather than defended against: a role
    deleted or renamed over there leaves somebody on staff reaching nothing.
    **Failing towards no access is the safe direction** — the alternative is
    somebody gaining screens because a row went missing.
  */
  let role: StaffSession["role"] = null;
  let roleMenu: string[] | null = null;

  if (data.role_key) {
    const { data: master } = await supabase
      .from("roles_master")
      .select("key, label, is_owner, is_active, portal_menu")
      .eq("key", data.role_key)
      .maybeSingle();

    if (master?.is_active) {
      role = { key: master.key, label: master.label, isOwner: master.is_owner };
      roleMenu = master.portal_menu ?? [];
    }
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    staff: { ...data, role_menu: roleMenu },
    role,
  };
}

/** Signed in and on the staff list, or away. */
export async function requireStaff(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect("/no-access");
  return session;
}

/**
 * Signed in, on the staff list, and allowed to open *this* screen.
 *
 * A screen this person may not reach answers as though it does not exist. Not
 * "you are not allowed" — a refusal that explains itself has told the reader
 * that the screen is there, which is information they did not have a moment
 * ago.
 */
export async function requireMenu(key: MenuKey): Promise<StaffSession> {
  const session = await requireStaff();
  if (!canReach(session.staff, key)) notFound();
  return session;
}

/*
  `requireOwner` was here, and it guarded exactly one screen: Team.

  That screen is gone — staff are managed in the company website's admin now —
  and with it the only thing in this application that could raise somebody's
  authority. There is nothing left for a second, coarser guard to protect, and
  a guard kept "in case" is a guard nobody maintains.
*/
