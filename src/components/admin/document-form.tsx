"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, FIELD } from "@/components/ui/field";
import { issueDocument } from "@/lib/actions/documents";
import { idleState } from "@/lib/actions/state";
import type { DocumentKindOption } from "@/lib/queries/documents";
import { cn } from "@/lib/utils";
import { useBusyWhile } from "@/components/forms/use-busy-while";

/**
 * Issuing something to a client.
 *
 * ---------------------------------------------------------------------------
 * **Every kind in the list came from the database**, along with whether it
 * needs an amount and whether it is normally signed. Nothing here names a kind.
 * Add a purchase order to `document_types` tomorrow and it appears in this
 * select, asking for the right fields, with no code changed.
 *
 * The amount box appears only for kinds that need one, and the signing tick is
 * ticked by default for kinds that are normally signed — both read off the
 * chosen kind's own row. A form that asked for an amount on a contract would
 * be asking somebody to leave a required-looking box empty.
 */
export function DocumentForm({
  projectId,
  clientId,
  kinds,
}: {
  projectId: string;
  clientId: string;
  kinds: DocumentKindOption[];
}) {
  const [state, action, pending] = useActionState(issueDocument, idleState);
  useBusyWhile(pending, "Working");
  const form = useRef<HTMLFormElement>(null);

  const [kindKey, setKindKey] = useState(kinds[0]?.key ?? "");
  const kind = kinds.find((option) => option.key === kindKey);

  /*
    The boxes clear on success; the chosen kind deliberately does not.

    Issuing invoice 004 is nearly always followed by 005, and putting the select
    back to the top of the list every time means re-choosing "Invoice" before
    every single one.

    It also removes the reason to write state inside an effect. `form.reset()`
    restores the uncontrolled inputs, and a controlled select it does not touch
    — which is exactly the behaviour wanted here rather than something worked
    around.
  */
  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);

  if (kinds.length === 0) {
    return (
      <p className="mt-4 text-sm text-text-muted">
        No kinds of document are set up yet. Add one in the company admin and it
        will appear here.
      </p>
    );
  }

  return (
    <form ref={form} action={action} className="mt-5 space-y-4">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="client_id" value={clientId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="What" required>
          {(id) => (
            <select
              id={id}
              name="kind_key"
              value={kindKey}
              onChange={(event) => setKindKey(event.target.value)}
              className={FIELD}
            >
              {kinds.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field
          label="Title"
          required
          error={state.fieldErrors?.title}
          className="sm:col-span-2"
        >
          {(id, describedBy) => (
            <input
              id={id}
              name="title"
              maxLength={200}
              required
              placeholder="Invoice 004 — March"
              aria-describedby={describedBy}
              aria-invalid={state.fieldErrors?.title ? true : undefined}
              className={FIELD}
            />
          )}
        </Field>
      </div>

      {/*
        Only for kinds that carry one — the kind's own row says which.

        Rendered rather than disabled: a greyed-out amount box on a contract
        invites somebody to wonder what they are missing.
      */}
      {kind?.needsAmount && (
        <Field label="Amount" required error={state.fieldErrors?.amount}>
          {(id, describedBy) => (
            <input
              id={id}
              name="amount"
              type="number"
              min={1}
              /* Money is not a multiple of anything. A round `step` makes the
                 browser silently refuse ₹50,000 and explain it in a tooltip
                 nobody reads — found here on 2026-08-30 on the payment form. */
              step="any"
              required
              inputMode="decimal"
              aria-describedby={describedBy}
              className={FIELD}
            />
          )}
        </Field>
      )}

      <Field label="Note" hint="Anything the client should read alongside it.">
        {(id) => (
          <textarea id={id} name="note" rows={2} maxLength={2000} className={FIELD} />
        )}
      </Field>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="needs_signature"
          /* `key` forces React to take the new default when the kind changes.
             A checkbox keeps whatever it was last set to otherwise, so picking
             Contract after Invoice would leave it unticked. */
          key={kindKey}
          defaultChecked={kind?.signsByDefault ?? false}
          className="mt-0.5 size-4 rounded border-border"
        />
        <span>
          <span className="font-medium">Needs signing</span>
          <span className="mt-0.5 block text-text-muted">
            Both sides sign it in the tracker. Nobody can change a signature
            afterwards, including you.
          </span>
        </span>
      </label>

      {state.status !== "idle" && state.message && !state.fieldErrors ? (
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

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? (
          <>
            <BrandSpinner />
            Issuing
          </>
        ) : (
          "Issue"
        )}
      </Button>
    </form>
  );
}
