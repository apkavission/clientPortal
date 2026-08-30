"use client";

import { useActionState } from "react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, FIELD } from "@/components/ui/field";
import { createProject } from "@/lib/actions/projects";
import { idleState } from "@/lib/actions/state";
import type { ClientRow } from "@/types/database";

/**
 * Two fields, and then the real form.
 *
 * A project needs a client and a name to exist. Everything else — the brief, the
 * money, the timeline — is filled in on the project itself, where there is room
 * for it. Asking for twenty fields before the record exists is how a project
 * ends up being written in a notebook instead.
 */
export function NewProjectForm({
  clients,
  preselected,
}: {
  clients: ClientRow[];
  preselected: string | null;
}) {
  const [state, action, pending] = useActionState(createProject, idleState);

  return (
    <form action={action} className="space-y-5">
      <Field label="Client" required error={state.fieldErrors?.client_id}>
        {(id, describedBy) => (
          <select
            id={id}
            name="client_id"
            required
            defaultValue={preselected ?? ""}
            aria-describedby={describedBy}
            className={FIELD}
          >
            <option value="" disabled>
              Choose a client
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.company_name ?? client.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        label="Project name"
        required
        hint="What the client would call it. The web address is made from this."
        error={state.fieldErrors?.name}
      >
        {(id, describedBy) => (
          <input
            id={id}
            name="name"
            required
            autoFocus
            maxLength={160}
            aria-describedby={describedBy}
            aria-invalid={state.fieldErrors?.name ? true : undefined}
            className={FIELD}
          />
        )}
      </Field>

      {state.status === "error" && state.message && !state.fieldErrors ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <BrandSpinner />
            Creating
          </>
        ) : (
          "Create project"
        )}
      </Button>
    </form>
  );
}
