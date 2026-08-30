"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, Send } from "lucide-react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { FIELD } from "@/components/ui/field";
import { approveRequest, sendRequestMessage } from "@/lib/actions/requests";
import { idleState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";

/**
 * Talking to the client about a request, and deciding it.
 *
 * Both controls live here because they are one job. An admin reads the thread,
 * asks what something means, and — usually in the same sitting — decides whether
 * it is work. Sending them elsewhere to approve would mean losing the
 * conversation they are deciding from.
 */

export function MessageBox({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(sendRequestMessage, idleState);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-3">
      <input type="hidden" name="request_id" value={requestId} />

      <label className="sr-only" htmlFor={`say-${requestId}`}>
        Your message
      </label>
      <textarea
        id={`say-${requestId}`}
        name="body"
        rows={3}
        required
        maxLength={4000}
        placeholder="Reply to the client, or ask what they meant…"
        className={cn(FIELD, "resize-y")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/*
          Labelled by who reads it rather than by the word "internal", because
          that is the question somebody is actually asking as they type.
        */}
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input
            type="checkbox"
            name="internal"
            className="size-4 rounded border-border-strong text-accent focus:ring-2 focus:ring-accent/20"
          />
          Only the team sees this
        </label>

        <Button type="submit" disabled={pending}>
          {pending ? <BrandSpinner /> : <Send className="size-4" aria-hidden />}
          {pending ? "Sending" : "Send"}
        </Button>
      </div>

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
    </form>
  );
}

/**
 * Approving it.
 *
 * **Two decisions, not one.** Whether this becomes work, and whether it costs
 * the client one of their agreed changes. They are separate because the second
 * only exists after delivery — before that, everything is part of agreeing what
 * to build.
 *
 * The tick is therefore only offered when it is real, and the reason it is
 * missing is stated rather than left to be guessed at.
 */
export function ApproveRequest({
  requestId,
  delivered,
  changesLeft,
  unfinished,
}: {
  requestId: string;
  delivered: boolean;
  changesLeft: number;
  unfinished: string[];
}) {
  const [state, action, pending] = useActionState(approveRequest, idleState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="request_id" value={requestId} />

      {delivered ? (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="as_change"
            defaultChecked={changesLeft > 0}
            disabled={changesLeft <= 0}
            className="mt-0.5 size-4 rounded border-border-strong text-accent focus:ring-2 focus:ring-accent/20"
          />
          <span>
            <span className="font-medium">
              Count this as one of the agreed changes
            </span>
            <span className="block text-text-subtle">
              {changesLeft > 0
                ? `${changesLeft} left. Approving without ticking this does not use one.`
                : "None left. Raise the allowance on the project first, or approve without counting it."}
            </span>
          </span>
        </label>
      ) : (
        <p className="measure rounded-xl bg-surface-2 px-4 py-3 text-sm text-text-muted">
          This project is not delivered yet
          {unfinished.length > 0 && (
            <>
              {" "}
              — {unfinished.join(", ")}{" "}
              {unfinished.length === 1 ? "has" : "have"} still to mark their part
              done
            </>
          )}
          . Nothing approved now counts against the change allowance, because a
          change is a change to something that was built.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? <BrandSpinner /> : <Check className="size-4" aria-hidden />}
        {pending ? "Approving" : "Approve — the team can see it"}
      </Button>

      {state.status !== "idle" && state.message ? (
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
    </form>
  );
}
