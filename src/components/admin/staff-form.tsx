"use client";

import { useActionState, useState } from "react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, FIELD } from "@/components/ui/field";
import { saveStaffMember } from "@/lib/actions/team";
import { idleState } from "@/lib/actions/state";
import { defaultMenuFor, GRANTABLE_ITEMS, resolveMenu } from "@/lib/auth/menu";
import { cn } from "@/lib/utils";
import type { StaffRole, StaffRow } from "@/types/database";

const ROLES: { value: StaffRole; label: string; detail: string }[] = [
  { value: "owner", label: "Owner", detail: "Everything, including this screen" },
  { value: "manager", label: "Manager", detail: "Everything, including this screen" },
  { value: "developer", label: "Developer", detail: "Work, projects and the request queue" },
  { value: "designer", label: "Designer", detail: "Work and projects" },
  { value: "qa", label: "QA", detail: "Work and projects" },
];

/**
 * One person: their role, whether they are active, and which screens they open.
 *
 * **The checkboxes show the resolved answer, not the stored one.** What is kept
 * in the database is the difference from the role's default — two small arrays —
 * and showing somebody those arrays would be showing them the implementation.
 * The boxes are ticked according to what this person actually reaches today, and
 * the difference is worked out again on save.
 *
 * Changing the role re-ticks them, because a role is a set of defaults and
 * leaving the old ticks in place after a change would silently turn every one of
 * them into a per-person override.
 */
export function StaffForm({ person }: { person: StaffRow }) {
  const [state, action, pending] = useActionState(saveStaffMember, idleState);
  const [role, setRole] = useState<StaffRole>(person.role);

  /*
    Re-derived whenever the role changes.

    While the role is the one they were saved with, the stored overrides apply;
    the moment somebody picks a different role, the boxes show that role's
    defaults instead. Anything else would carry an override the person editing
    never chose.
  */
  const ticked =
    role === person.role
      ? resolveMenu(person)
      : new Set(defaultMenuFor(role));

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="id" value={person.id} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" required error={state.fieldErrors?.full_name}>
          {(id, describedBy) => (
            <input
              id={id}
              name="full_name"
              required
              defaultValue={person.full_name}
              maxLength={160}
              aria-describedby={describedBy}
              className={FIELD}
            />
          )}
        </Field>

        <Field label="Role" required>
          {(id) => (
            <select
              id={id}
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value as StaffRole)}
              className={FIELD}
            >
              {ROLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} — {option.detail}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Screens they can open</legend>
        <p className="measure mt-1.5 text-xs leading-relaxed text-text-subtle">
          Ticked by their role to begin with. Change one and it becomes theirs
          personally — kept as a difference, so a change to what the role means
          still reaches them.
        </p>

        <div className="mt-3 space-y-2">
          {GRANTABLE_ITEMS.map((item) => (
            <label key={item.key} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="menu"
                value={item.key}
                defaultChecked={ticked.has(item.key)}
                key={`${item.key}-${role}`}
                className="size-4 shrink-0 rounded-sm border-border-strong text-accent focus:ring-2 focus:ring-accent/20"
              />
              {item.label}
            </label>
          ))}
        </div>

        <p className="mt-3 text-xs text-text-subtle">
          The Team screen is not in this list on purpose. Giving somebody it is
          giving them every other screen, because they could change their own
          role — so it comes with being an owner rather than being handed out.
        </p>
      </fieldset>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={person.is_active}
          className="mt-0.5 size-4 shrink-0 rounded-sm border-border-strong text-accent focus:ring-2 focus:ring-accent/20"
        />
        <span>
          <span className="font-medium">Active</span>
          <span className="mt-1 block text-xs text-text-subtle">
            Turning this off closes every door on their next request, and keeps
            everything they have done. This is what to use when somebody leaves.
          </span>
        </span>
      </label>

      {state.status !== "idle" && state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={cn(
            "text-sm",
            state.status === "error" ? "text-danger" : "text-success",
          )}
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <BrandSpinner />
            Saving
          </>
        ) : (
          "Save"
        )}
      </Button>
    </form>
  );
}
