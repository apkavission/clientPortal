"use client";

import { useActionState, useState } from "react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, FIELD, LABEL } from "@/components/ui/field";
import { saveProject } from "@/lib/actions/projects";
import { idleState } from "@/lib/actions/state";
import { STAGE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useBusyWhile } from "@/components/forms/use-busy-while";
import type {
  ClientProjectRow,
  ProjectStage,
  ServiceMasterRow,
  StaffRow,
} from "@/types/database";

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

/** Today, as the `yyyy-mm-dd` a date input wants, in the reader's own timezone. */
function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * The earliest date a picker will offer.
 *
 * Today, except where the record already holds something earlier. A project
 * that genuinely started last month must stay editable — a floor that rejected
 * its own saved value would make the row impossible to save again without
 * changing a date nobody meant to change. So the stored value is its own floor
 * when it is older than today, and everything else cannot go backwards.
 */
function earliest(existing: string | null | undefined): string {
  const now = today();
  return existing && existing < now ? existing : now;
}

/**
 * The four parts of the form, as tabs.
 *
 * Labels short enough to sit in a row on a phone; the headings inside each
 * panel still say the longer thing.
 */
const STEPS = [
  { label: "The project" },
  { label: "Brief and plan" },
  { label: "Money" },
  { label: "Ours only" },
] as const;

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
export function ProjectForm({
  project,
  services,
  staff,
  clients,
  memberIds,
}: {
  project: ClientProjectRow;
  /** The company's catalogue, from `company.services` through the master view. */
  services: ServiceMasterRow[];
  /** Everybody who could hold this project. Active staff only. */
  staff: StaffRow[];
  /** Every client, so a project can be moved to the right one. */
  clients: { id: string; name: string }[];
  /** Who is on the project already, as staff ids. */
  memberIds: string[];
}) {
  const [state, action, pending] = useActionState(saveProject, idleState);
  useBusyWhile(pending, "Saving project");
  const [step, setStep] = useState(0);

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="id" value={project.id} />

      {/*
        Tabs over one form, not four forms.

        The form is long — a name, the brief, the plan, the money and the
        internal notes — and reading it as one column meant scrolling past
        three quarters of it to change a price.

        **Every panel stays in the DOM.** They are hidden with the `hidden`
        attribute rather than unmounted, because an input that is not rendered
        is not submitted: unmounting the panels would mean whichever tab was
        closed when Save was pressed silently cleared its own fields. That is
        the failure the note above is about — half a quote going out — and
        hiding rather than removing is what keeps one save honest.
      */}
      <div role="tablist" aria-label="Sections of this project" className="flex flex-wrap gap-1">
        {STEPS.map((tab, index) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={step === index}
            onClick={() => setStep(index)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm transition-colors",
              step === index
                ? "bg-accent-soft font-medium text-accent"
                : "text-text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------------- */}
      <section hidden={step !== 0} className="rounded-2xl border border-border bg-surface p-6">
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

            <Field label="Starts" error={state.fieldErrors?.start_date}>
              {(id, describedBy) => (
                <input
                  id={id}
                  name="start_date"
                  type="date"
                  min={earliest(project.start_date)}
                  defaultValue={project.start_date ?? ""}
                  aria-describedby={describedBy}
                  className={FIELD}
                />
              )}
            </Field>

            <Field label="Target date" error={state.fieldErrors?.target_date}>
              {(id, describedBy) => (
                <input
                  id={id}
                  name="target_date"
                  type="date"
                  /* Never before the day the work starts. The picker enforces
                     the floor it can see; the Server Action enforces the real
                     rule, because a date input is a convenience and not a
                     guarantee — the value still arrives as text in a POST. */
                  min={earliest(project.target_date ?? project.start_date)}
                  defaultValue={project.target_date ?? ""}
                  aria-describedby={describedBy}
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

          {/*
            What this project actually is.

            A project carried a name, a brief and a price, and nowhere said
            which of our services it is — so "Clinic website and booking" read
            as a website to one person and as a website with SEO to another,
            and the disagreement surfaced at the invoice.

            Checkboxes rather than a single select, because a project is
            regularly more than one thing: a site, then the SEO on it, then the
            marketing that follows. Slugs are stored, and the names come from
            the catalogue, so renaming a service on the website renames it here.
          */}
          {/*
            Whose project this is.

            It was set once, on the approval form, and never again — so a
            project handed to somebody else still named the person who first
            picked it up, and the client's messages still went to them. People
            leave and work moves; the record has to be able to say so.

            "Nobody yet" is a real answer and is offered as one. A project
            between owners is a normal state, and forcing a name into the field
            to get the form saved would put a wrong name there instead of no
            name — which is worse, because a wrong name looks answered.
          */}
          {/*
            Which client this belongs to.

            Editable, not fixed at creation. A project started under the wrong
            company, or moved between two entities of the same group, could
            only be corrected in SQL before this — and the owner asked for the
            same thing the lead developer needed: the record has to be able to
            change when the arrangement does.
          */}
          <Field label="Client" hint="Everything about this project moves with it.">
            {(id) => (
              <select
                id={id}
                name="client_id"
                defaultValue={project.client_id}
                className={FIELD}
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          {/*
            Who is working on it.

            Not the same question as "who it sits under": one person is
            answerable for the project, several build it. These rows decide
            when the project counts as delivered — it is delivered when nobody
            on it is still unfinished — so leaving them empty leaves a project
            that can never close.

            Nothing wrote this table until 2026-09-01. Rows arrived by hand or
            not at all, which is why a project could sit finished and never say
            so.
          */}
          <fieldset>
            <legend className={LABEL}>Who is working on it</legend>
            <p className="mt-1 text-sm text-text-subtle">
              The project is delivered when everybody ticked here has finished
              their part.
            </p>

            {staff.length === 0 ? (
              <p className="mt-2 text-sm text-text-subtle">
                Nobody is on the staff list yet. They are added in the company
                admin.
              </p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {staff.map((person) => (
                  <label key={person.id} className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      name="member_ids"
                      value={person.id}
                      defaultChecked={memberIds.includes(person.id)}
                      className="mt-1 size-4 shrink-0 rounded border-border-strong"
                    />
                    <span className="text-sm">{person.full_name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <Field
            label="Who it sits under"
            hint="The client's messages about this project go to them."
          >
            {(id) => (
              <select
                id={id}
                name="lead_developer_id"
                defaultValue={project.lead_developer_id ?? ""}
                className={FIELD}
              >
                <option value="">Nobody yet</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <fieldset className="sm:col-span-3">
            <legend className={LABEL}>What this project includes</legend>

            {services.length === 0 ? (
              <p className="mt-1.5 text-sm text-text-subtle">
                The service catalogue could not be read, so this cannot be
                chosen right now. Everything else on this form still saves.
              </p>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {services.map((service) => (
                  <label key={service.slug} className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      name="service_keys"
                      value={service.slug}
                      defaultChecked={project.service_keys?.includes(service.slug)}
                      className="mt-1 size-4 shrink-0 rounded border-border-strong"
                    />
                    <span className="text-sm">{service.short_name || service.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section hidden={step !== 1} className="rounded-2xl border border-border bg-surface p-6">
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
      <section hidden={step !== 2} className="rounded-2xl border border-border bg-surface p-6">
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
      <section hidden={step !== 3} className="rounded-2xl border border-border bg-surface p-6">
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
        <p className="mb-3 text-xs text-text-subtle">
          Saves every tab, not only the one you are looking at.
        </p>
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
