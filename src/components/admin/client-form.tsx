"use client";

import { useActionState } from "react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, FIELD } from "@/components/ui/field";
import { createClientRecord, saveClientRecord } from "@/lib/actions/clients";
import { idleState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";
import type { ClientRow } from "@/types/database";
import { useBusyWhile } from "@/components/forms/use-busy-while";

/**
 * A client, added or edited.
 *
 * One form for both, because they collect exactly the same thing and two forms
 * would be two places to add a field to. The only difference is which action it
 * posts to and what the button says.
 *
 * **Everything except the name is optional**, and that is deliberate. A client
 * is very often added straight after a phone call, when all anybody has is a
 * company name — and a form that demands a GST number at that moment is a form
 * people work around by not using it.
 */
export function ClientForm({ client }: { client?: ClientRow }) {
  const [state, action, pending] = useActionState(
    client ? saveClientRecord : createClientRecord,
    idleState,
  );
  useBusyWhile(pending, "Working");

  return (
    <form action={action} className="space-y-8">
      {client && <input type="hidden" name="id" value={client.id} />}

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Who they are</h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field
            label="Contact name"
            required
            hint="The person we actually deal with."
            error={state.fieldErrors?.name}
          >
            {(id, describedBy) => (
              <input
                id={id}
                name="name"
                required
                defaultValue={client?.name ?? ""}
                maxLength={160}
                aria-describedby={describedBy}
                aria-invalid={state.fieldErrors?.name ? true : undefined}
                className={FIELD}
              />
            )}
          </Field>

          <Field
            label="Company"
            hint="As it should appear on a document sent to them."
            error={state.fieldErrors?.company_name}
          >
            {(id, describedBy) => (
              <input
                id={id}
                name="company_name"
                defaultValue={client?.company_name ?? ""}
                maxLength={160}
                aria-describedby={describedBy}
                className={FIELD}
              />
            )}
          </Field>

          <Field label="Email" error={state.fieldErrors?.email}>
            {(id, describedBy) => (
              <input
                id={id}
                name="email"
                type="email"
                defaultValue={client?.email ?? ""}
                maxLength={160}
                aria-describedby={describedBy}
                aria-invalid={state.fieldErrors?.email ? true : undefined}
                className={FIELD}
              />
            )}
          </Field>

          <Field label="Phone" error={state.fieldErrors?.phone}>
            {(id, describedBy) => (
              <input
                id={id}
                name="phone"
                type="tel"
                defaultValue={client?.phone ?? ""}
                maxLength={40}
                aria-describedby={describedBy}
                className={FIELD}
              />
            )}
          </Field>

          <Field
            label="WhatsApp"
            hint="With the country code, if it is different from the phone."
          >
            {(id, describedBy) => (
              <input
                id={id}
                name="whatsapp"
                type="tel"
                defaultValue={client?.whatsapp ?? ""}
                maxLength={40}
                aria-describedby={describedBy}
                className={FIELD}
              />
            )}
          </Field>

          <Field label="Status" required>
            {(id) => (
              <select
                id={id}
                name="status"
                defaultValue={client?.status ?? "active"}
                className={FIELD}
              >
                <option value="prospect">Prospect — talking, nothing agreed</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="closed">Closed</option>
              </select>
            )}
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">For their documents</h2>
        <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
          These go onto anything printed for them — a proposal, an agreement, an
          invoice. Filling them in once saves looking them up every time.
        </p>

        <div className="mt-5 space-y-5">
          <Field label="GSTIN">
            {(id) => (
              <input
                id={id}
                name="gst"
                defaultValue={client?.gst ?? ""}
                maxLength={40}
                className={cn(FIELD, "max-w-sm font-mono")}
              />
            )}
          </Field>

          <Field label="Address">
            {(id) => (
              <textarea
                id={id}
                name="address"
                rows={3}
                defaultValue={client?.address ?? ""}
                maxLength={1000}
                className={cn(FIELD, "resize-y")}
              />
            )}
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font------semibold">Notes</h2>
        <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
          Ours. Nothing here is ever printed or shown to them.
        </p>

        <div className="mt-5">
          <Field label="Anything worth remembering">
            {(id) => (
              <textarea
                id={id}
                name="notes"
                rows={4}
                defaultValue={client?.notes ?? ""}
                maxLength={4000}
                className={cn(FIELD, "resize-y")}
              />
            )}
          </Field>
        </div>
      </section>

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

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-surface/90 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <BrandSpinner />
              Saving
            </>
          ) : client ? (
            "Save client"
          ) : (
            "Add client"
          )}
        </Button>
      </div>
    </form>
  );
}
