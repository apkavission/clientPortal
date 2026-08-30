import type { Metadata } from "next";
import { Badge } from "@/components/admin/badge";
import { StaffForm } from "@/components/admin/staff-form";
import { requireOwner } from "@/lib/auth/session";
import { getStaff } from "@/lib/queries/admin";

export const metadata: Metadata = { title: "Team" };

/**
 * Who works here, and what each of them can open.
 *
 * Behind `requireOwner()` rather than a menu key, because this is the screen
 * that hands out the others. It cannot itself be one of the things handed out —
 * anybody with it could raise their own role and take the rest, which is not a
 * grant, it is what being an owner means.
 *
 * **Adding a person is not here yet**, and that is honest rather than hidden: a
 * staff row has to be matched to a Supabase auth account, and the invitation
 * flow that does that is still to be built. Until it is, somebody is added with
 * one line of SQL — see docs/owner-checklist.md. Everything about an existing
 * person is editable here.
 */
export default async function TeamPage() {
  await requireOwner();

  const staff = await getStaff();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
          A role sets what somebody can open; ticking a box on one person changes
          it for them alone. What is stored is the difference, so changing what a
          role means still reaches everybody on it.
        </p>
      </header>

      <p className="measure mt-6 rounded-xl border border-border bg-surface-2/50 p-4 text-sm leading-relaxed">
        Adding somebody new is done in SQL for now — a staff row has to be
        matched to their sign-in account, and the invitation flow that does that
        automatically has not been built. It is in{" "}
        <span className="font-mono text-xs">docs/owner-checklist.md</span>.
      </p>

      <ul className="mt-10 space-y-6">
        {staff.map((person) => (
          <li key={person.id} className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{person.full_name}</h2>
                {person.email && (
                  <p className="mt-0.5 text-sm text-text-muted">{person.email}</p>
                )}
              </div>

              {person.is_active ? (
                <Badge tone="success">Active</Badge>
              ) : (
                <Badge>Inactive</Badge>
              )}
            </div>

            <div className="mt-6 border-t border-border pt-6">
              <StaffForm person={person} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
