"use client";

import { useActionState, useState } from "react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { deleteClientRecord } from "@/lib/actions/clients";
import { idleState } from "@/lib/actions/state";
import { useBusyWhile } from "@/components/forms/use-busy-while";

/**
 * Remove a client.
 *
 * Behind a confirmation, and the confirmation says what the cascade actually
 * reaches rather than asking "are you sure?" — a question nobody has ever
 * answered no to. The action refuses outright while any project still exists,
 * so the dangerous version of this can only be reached deliberately.
 *
 * Typing the name to confirm was considered and left out: this button is
 * already refused for any client with work under it, so the remaining case is a
 * record added by mistake five minutes ago. Making that a spelling test is
 * ceremony rather than safety.
 */
export function DeleteClient({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(deleteClientRecord, idleState);
  useBusyWhile(pending, "Removing client record");
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <div>
        <h2 className="text-base font-semibold">Remove this client</h2>
        <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
          Only possible once they have no projects. If work has been done for
          them, set their status to Closed instead — that takes them out of the
          way and keeps the history.
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => setAsking(true)}>
          Remove {name}
        </Button>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />

      <h2 className="text-base font-semibold">Remove {name}?</h2>
      <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
        The client record and their contacts are deleted and cannot be brought
        back. This is refused if any project still exists under them.
      </p>

      {state.status === "error" && state.message ? (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? (
            <>
              <BrandSpinner />
              Removing
            </>
          ) : (
            "Yes, remove them"
          )}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setAsking(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
