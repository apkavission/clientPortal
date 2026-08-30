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

export interface StaffSession {
  userId: string;
  email: string | null;
  staff: StaffRow;
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

  return { userId: user.id, email: user.email ?? null, staff: data };
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

/** An owner or a manager. The team screen, and nothing else so far. */
export async function requireOwner(): Promise<StaffSession> {
  const session = await requireStaff();
  if (session.staff.role !== "owner" && session.staff.role !== "manager") notFound();
  return session;
}
