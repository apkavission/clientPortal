"use client";

import { useActionState, useState } from "react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, FIELD } from "@/components/ui/field";
import { approveProject } from "@/lib/actions/projects";
import { idleState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";
import type { StaffRow } from "@/types/database";

/**
 * The client said yes.
 *
 * This is the only button in the panel that reaches outside the database, and
 * the form says so before it is pressed: it creates two sign-ins and sends two
 * emails. It cannot be undone by pressing it again — the action refuses a second
 * run, because a repeat would issue a new password to somebody who may already
 * have changed theirs, and the only person who finds out is the one locked out.
 *
 * The client contact is filled in from the client record and left editable. The
 * person who signs in is very often not the person whose name is on the company,
 * and finding that out at this moment is normal rather than exceptional.
 */
export function ApproveForm({
  projectId,
  contactName,
  contactEmail,
  staff,
}: {
  projectId: string;
  contactName: string;
  contactEmail: string;
  staff: StaffRow[];
}) {
  const [state, action, pending] = useActionState(approveProject, idleState);
  const [open, setOpen] = useState(false);

  if (state.status === "success") {
    return (
      <p role="status" className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
        {state.message}
      </p>
    );
  }

  if (!open) {
    return (
      <div>
        <p className="measure text-sm leading-relaxed text-text-muted">
          When the client accepts the quote, approving it here creates their
          sign-in and the developer&rsquo;s, emails both, and opens the project up
          to them.
        </p>
        <Button className="mt-4" onClick={() => setOpen(true)}>
          The client has approved it
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="project_id" value={projectId} />

      <p className="measure rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm leading-relaxed">
        This creates two logins and sends two emails. It can only be done once —
        pressing it again later would reset a password somebody may already have
        changed.
      </p>

      <Field
        label="Who is building it"
        required
        hint="They are emailed the tracker address and told which project."
        error={state.fieldErrors?.lead_developer_id}
      >
        {(id, describedBy) => (
          <select
            id={id}
            name="lead_developer_id"
            required
            defaultValue=""
            aria-describedby={describedBy}
            className={FIELD}
          >
            <option value="" disabled>
              Choose a developer
            </option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Client contact"
          required
          hint="The person who will sign in."
          error={state.fieldErrors?.contact_name}
        >
          {(id, describedBy) => (
            <input
              id={id}
              name="contact_name"
              required
              defaultValue={contactName}
              maxLength={160}
              aria-describedby={describedBy}
              className={FIELD}
            />
          )}
        </Field>

        <Field
          label="Their email"
          required
          hint="Where the sign-in goes. Check it — a typo here fails silently."
          error={state.fieldErrors?.contact_email}
        >
          {(id, describedBy) => (
            <input
              id={id}
              name="contact_email"
              type="email"
              required
              defaultValue={contactEmail}
              maxLength={160}
              aria-describedby={describedBy}
              aria-invalid={state.fieldErrors?.contact_email ? true : undefined}
              className={FIELD}
            />
          )}
        </Field>
      </div>

      <Field label="Anything to record about the approval">
        {(id) => (
          <textarea
            id={id}
            name="note"
            rows={2}
            maxLength={2000}
            className={cn(FIELD, "resize-y")}
          />
        )}
      </Field>

      {state.status === "error" && state.message && !state.fieldErrors ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <BrandSpinner />
              Setting it up
            </>
          ) : (
            "Approve and send the logins"
          )}
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
