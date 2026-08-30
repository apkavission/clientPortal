"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, UserMinus } from "lucide-react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, FIELD } from "@/components/ui/field";
import { inviteContact, removeContact } from "@/lib/actions/contacts";
import { idleState } from "@/lib/actions/state";
import { cn, formatDate } from "@/lib/utils";

export interface Contact {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  accepted_at: string | null;
  created_at: string;
}

/**
 * The people at a client company who can sign in.
 *
 * Until this existed there was exactly one way a client got a login — approving
 * their project, which made one account for one named contact. The second person
 * who actually reads the updates, or the one who took over when the first left,
 * had to be added straight into the database.
 *
 * **A login is made for them; nobody signs themselves up.** The password is
 * generated, emailed once, and can never be read back — the same rule as every
 * other account in this estate.
 *
 * **Removing somebody ends their access and keeps their history.** The comment
 * they wrote and the approval they answered are the point of having a record;
 * deleting the person would leave both unattributable.
 */
export function Contacts({
  clientId,
  contacts,
}: {
  clientId: string;
  contacts: Contact[];
}) {
  const [adding, setAdding] = useState(false);

  const active = contacts.filter((contact) => contact.is_active);
  const past = contacts.filter((contact) => !contact.is_active);

  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Who can sign in</h2>

        {!adding && (
          <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Add somebody
          </Button>
        )}
      </div>

      {active.length === 0 ? (
        <p className="measure mt-4 text-sm leading-relaxed text-text-muted">
          Nobody at this client can sign in yet. Approving a project creates the
          first login; anybody else is added here.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {active.map((contact) => (
            <li key={contact.id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {contact.full_name}
                  <span className="ml-2 text-xs font-normal text-text-subtle">
                    {contact.role}
                  </span>
                </p>
                <p className="truncate text-xs text-text-subtle">
                  {contact.email} · added {formatDate(contact.created_at)}
                </p>
              </div>

              <RemoveContact contactId={contact.id} name={contact.full_name} />
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <p className="mt-4 border-t border-border pt-4 text-xs text-text-subtle">
          No longer has access: {past.map((contact) => contact.full_name).join(", ")}.
          Everything they wrote is still there.
        </p>
      )}

      {adding && (
        <div className="mt-6 border-t border-border pt-6">
          <InviteForm clientId={clientId} onDone={() => setAdding(false)} />
        </div>
      )}
    </section>
  );
}

function InviteForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(inviteContact, idleState);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-4">
      <input type="hidden" name="client_id" value={clientId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={state.fieldErrors?.full_name}>
          {(id, describedBy) => (
            <input
              id={id}
              name="full_name"
              required
              maxLength={160}
              aria-describedby={describedBy}
              className={FIELD}
            />
          )}
        </Field>

        <Field
          label="Email"
          required
          hint="Their login. A generated password is emailed to it once."
          error={state.fieldErrors?.email}
        >
          {(id, describedBy) => (
            <input
              id={id}
              name="email"
              type="email"
              required
              aria-describedby={describedBy}
              className={FIELD}
            />
          )}
        </Field>
      </div>

      <Field label="What they are" hint="Only a label today. Everybody at a client sees the same things.">
        {(id) => (
          <select id={id} name="role" defaultValue="member" className={cn(FIELD, "sm:w-56")}>
            <option value="primary">Main contact</option>
            <option value="member">Team member</option>
            <option value="viewer">Watching only</option>
          </select>
        )}
      </Field>

      {state.status !== "idle" && state.message && !state.fieldErrors ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={cn(
            "measure text-sm",
            state.status === "error" ? "text-danger" : "text-success",
          )}
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <BrandSpinner /> : <Plus className="size-4" aria-hidden />}
          {pending ? "Adding" : "Add and email them"}
        </Button>
        <Button type="button" variant="quiet" onClick={onDone}>
          Done
        </Button>
      </div>
    </form>
  );
}

function RemoveContact({ contactId, name }: { contactId: string; name: string }) {
  const [state, action, pending] = useActionState(removeContact, idleState);

  return (
    <form action={action}>
      <input type="hidden" name="contact_id" value={contactId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`End ${name}'s access`}
        className="rounded-lg p-2 text-text-subtle transition-colors hover:bg-surface-2 hover:text-danger disabled:opacity-50"
      >
        <UserMinus className="size-4" aria-hidden />
      </button>
      {state.status === "error" && state.message && (
        <span role="alert" className="ml-2 text-xs text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}
