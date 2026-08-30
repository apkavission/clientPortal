"use client";

import { useActionState } from "react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, FIELD } from "@/components/ui/field";
import { saveProject } from "@/lib/actions/projects";
import { idleState } from "@/lib/actions/state";
import { STAGE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ClientProjectRow, ProjectStage } from "@/types/database";

const STAGES: ProjectStage[] = [
  "discovery",
  "design",
  "development",
  "testing",
  "launch",
  "support",
  "on_hold",
  "closed",
];

/**
 * Everything about a project, on one form.
 *
 * Deliberately one form and one save button rather than five tabs that each
 * save separately. These fields belong to a single conversation — what they
 * asked for, what we will build, what it costs, how long, and what it does not
 * include — and splitting them is how half a quote gets sent to somebody.
 *
 * **The brief and the plan are two boxes, not one.** What the client asked for
 * and what we are going to build are different things, and the difference
 * between them is where every misunderstanding on every project starts. Writing
 * them separately forces somebody to notice when they have drifted apart.
 *
 * **What is not included has its own box** for the same reason. It is the half
 * everyone leaves out and the half that ends arguments, so it gets a field with
 * a label rather than a sentence buried in the terms.
 */
export function ProjectForm({ project }: { project: ClientProjectRow }) {
  const [state, action, pending] = useActionState(saveProject, idleState);

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="id" value={project.id} />

      {/* ---------------------------------------------------------------- */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">The project</h2>

        <div className="mt-5 space-y-5">
          <Field label="Name" required error={state.fieldErrors?.name}>
            {(id, describedBy) => (
              <input
                id={id}
                name="name"
                required
                defaultValue={project.name}
                maxLength={160}
                aria-describedby={describedBy}
                aria-invalid={state.fieldErrors?.name ? true : undefined}
                className={FIELD}
              />
            )}
          </Field>

          <Field
            label="One-line summary"
            hint="How you would describe it in a sentence."
          >
            {(id) => (
              <input
                id={id}
                name="summary"
                defaultValue={project.summary ?? ""}
                maxLength={600}
                className={FIELD}
              />
            )}
          </Field>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Stage" required>
              {(id) => (
                <select id={id} name="stage" defaultValue={project.stage} className={FIELD}>
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {STAGE_LABEL[stage]}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Starts">
              {(id) => (
                <input
                  id={id}
                  name="start_date"
                  type="date"
                  defaultValue={project.start_date ?? ""}
                  className={FIELD}
                />
              )}
            </Field>

            <Field label="Target date">
              {(id) => (
                <input
                  id={id}
                  name="target_date"
                  type="date"
                  defaultValue={project.target_date ?? ""}
                  className={FIELD}
                />
              )}
            </Field>
          </div>

          <Field
            label="How long, in weeks"
            hint="What goes on the document. The target date above is the working deadline."
            error={state.fieldErrors?.estimated_weeks}
          >
            {(id, describedBy) => (
              <input
                id={id}
                name="estimated_weeks"
                type="number"
                min={1}
                max={260}
                inputMode="numeric"
                defaultValue={project.estimated_weeks ?? ""}
                aria-describedby={describedBy}
                className={cn(FIELD, "max-w-32")}
              />
            )}
          </Field>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">What was asked for, and what we will do</h2>
        <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
          Both of these go onto the document the client is sent. Keeping them
          apart is the point: the gap between what somebody asked for and what
          you understood is where projects go wrong, and you only see the gap if
          they are written side by side.
        </p>

        <div className="mt-5 space-y-5">
          <Field
            label="What the client asked for"
            hint="Their words, as close as you can keep them."
          >
            {(id) => (
              <textarea
                id={id}
                name="client_brief"
                rows={5}
                defaultValue={project.client_brief ?? ""}
                maxLength={4000}
                className={cn(FIELD, "resize-y")}
              />
            )}
          </Field>

          <Field
            label="What we will build"
            hint="Ours. Specific enough that somebody who was not in the meeting could build it."
          >
            {(id) => (
              <textarea
                id={id}
                name="what_we_will_do"
                rows={6}
                defaultValue={project.what_we_will_do ?? ""}
                maxLength={4000}
                className={cn(FIELD, "resize-y")}
              />
            )}
          </Field>

          <Field
            label="What this does NOT include"
            hint="The half everybody forgets, and the half that ends arguments in week six."
          >
            {(id) => (
              <textarea
                id={id}
                name="exclusions"
                rows={4}
                defaultValue={project.exclusions ?? ""}
                maxLength={4000}
                className={cn(FIELD, "resize-y")}
              />
            )}
          </Field>
        </div>

        {/* -------------------------------------------------------------- */}
        <div className="mt-6 grid gap-5 border-t border-border pt-6 sm:grid-cols-[10rem_1fr]">
          <Field
            label="Changes included"
            hint="Rounds of changes after delivery. Zero means none were agreed."
            error={state.fieldErrors?.change_limit}
          >
            {(id) => (
              <input
                id={id}
                name="change_limit"
                type="number"
                min={0}
                max={99}
                step={1}
                inputMode="numeric"
                defaultValue={project.change_limit ?? 0}
                className={cn(FIELD, "w-28")}
              />
            )}
          </Field>

          <Field
            label="What counts as one change"
            hint="The sentence somebody reads out when there is an argument about it. Shown to the client in the tracker."
          >
            {(id) => (
              <textarea
                id={id}
                name="change_terms"
                rows={3}
                defaultValue={project.change_terms ?? ""}
                maxLength={2000}
                className={cn(FIELD, "resize-y")}
              />
            )}
          </Field>
        </div>

        <p className="measure mt-4 text-xs leading-relaxed text-text-subtle">
          The allowance only starts counting once the project is delivered —
          which happens when every person on it has marked their part done.
          Anything the client asks for before that is part of agreeing what to
          build, and is never counted against these.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Money</h2>
        <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
          Only the quote and the discount are typed here. What has been paid comes
          from the receipts recorded on this page, and what is outstanding is the
          arithmetic — neither is a box anybody can type into, because a figure
          that is typed drifts from the payments it is supposed to summarise.
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Quoted amount" hint="Before any discount.">
            {(id) => (
              <input
                id={id}
                name="contract_value"
                type="number"
                min={0}
                /* step="any" — see payment-form.tsx. A round step silently
                   refuses any amount that is not on its ladder. */
                step="any"
                inputMode="decimal"
                defaultValue={project.contract_value ?? ""}
                className={FIELD}
              />
            )}
          </Field>

          <Field
            label="Discount"
            hint="Shown as its own line on the document, not folded into a smaller total."
            error={state.fieldErrors?.discount_amount}
          >
            {(id, describedBy) => (
              <input
                id={id}
                name="discount_amount"
                type="number"
                min={0}
                /* step="any" — see payment-form.tsx. A round step silently
                   refuses any amount that is not on its ladder. */
                step="any"
                inputMode="decimal"
                defaultValue={project.discount_amount ?? 0}
                aria-describedby={describedBy}
                aria-invalid={state.fieldErrors?.discount_amount ? true : undefined}
                className={FIELD}
              />
            )}
          </Field>
        </div>

        <div className="mt-5 space-y-5">
          <Field
            label="Payment terms"
            hint="When money is due, and in what parts. Printed on the document exactly as written."
          >
            {(id) => (
              <textarea
                id={id}
                name="payment_terms"
                rows={3}
                defaultValue={project.payment_terms ?? ""}
                maxLength={2000}
                className={cn(FIELD, "resize-y")}
              />
            )}
          </Field>

          <Field label="Terms and conditions">
            {(id) => (
              <textarea
                id={id}
                name="terms"
                rows={4}
                defaultValue={project.terms ?? ""}
                maxLength={4000}
                className={cn(FIELD, "resize-y")}
              />
            )}
          </Field>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Ours only</h2>

        <div className="mt-5 space-y-5">
          <Field
            label="Internal notes"
            hint="Never printed, never shown to the client, and no policy lets their account read this table at all."
          >
            {(id) => (
              <textarea
                id={id}
                name="internal_notes"
                rows={4}
                defaultValue={project.internal_notes ?? ""}
                maxLength={4000}
                className={cn(FIELD, "resize-y")}
              />
            )}
          </Field>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="is_client_visible"
              defaultChecked={project.is_client_visible}
              className="mt-0.5 size-4 shrink-0 rounded-sm border-border-strong text-accent focus:ring-2 focus:ring-accent/20"
            />
            <span>
              <span className="font-medium">The client can see this project</span>
              <span className="mt-1 block text-xs text-text-subtle">
                Turned on automatically when the project is approved. Before that
                a project can exist here without being shared, which is the
                normal state for the first day or two.
              </span>
            </span>
          </label>
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
          ) : (
            "Save project"
          )}
        </Button>
      </div>
    </form>
  );
}
