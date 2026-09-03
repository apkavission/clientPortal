"use client";

import { useActionState, useEffect, useRef } from "react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, FIELD } from "@/components/ui/field";
import { recordPayment } from "@/lib/actions/projects";
import { idleState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";
import { useBusyWhile } from "@/components/forms/use-busy-while";

/**
 * Money in.
 *
 * Each receipt is its own row. Nothing here lets anybody type what is left —
 * that is worked out from these rows, the quote and the discount, and a figure
 * that is typed drifts from the payments it is meant to summarise.
 *
 * The form clears on success, because the same payment entered twice is the
 * mistake this screen invites, and a box still holding the last amount is the
 * invitation.
 */
export function PaymentForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(recordPayment, idleState);
  useBusyWhile(pending, "Working");
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="mt-5 space-y-4">
      <input type="hidden" name="project_id" value={projectId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Amount" required error={state.fieldErrors?.amount}>
          {(id, describedBy) => (
            <input
              id={id}
              name="amount"
              type="number"
              min={1}
              /* step="any" and not a round step.

              `step={100}` with `min={1}` makes the valid values 1, 101, 201 …
              so a browser silently refuses ₹50,000 and says only "the two
              nearest valid values are 49901 and 50001" in a tooltip nobody
              reads. The form simply does not submit and nothing explains why.
              Found on 2026-08-30 by a payment that would not save.

              Money is not a multiple of anything. */
              step="any"
              required
              inputMode="decimal"
              aria-describedby={describedBy}
              aria-invalid={state.fieldErrors?.amount ? true : undefined}
              className={FIELD}
            />
          )}
        </Field>

        <Field label="Received on" required error={state.fieldErrors?.paid_on}>
          {(id, describedBy) => (
            <input
              id={id}
              name="paid_on"
              type="date"
              required
              aria-describedby={describedBy}
              className={FIELD}
            />
          )}
        </Field>

        <Field label="How">
          {(id) => (
            <select id={id} name="method" defaultValue="bank" className={FIELD}>
              <option value="bank">Bank transfer</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          )}
        </Field>
      </div>

      <Field
        label="Reference"
        hint="A UTR, a cheque number, whatever lets you find it again."
      >
        {(id) => <input id={id} name="reference" maxLength={120} className={FIELD} />}
      </Field>

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
            Recording
          </>
        ) : (
          "Record payment"
        )}
      </Button>
    </form>
  );
}
