"use client";

import { useActionState, useState } from "react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, FIELD, LABEL } from "@/components/ui/field";
import { convertRequest, triageRequest } from "@/lib/actions/requests";
import { idleState, type ActionState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";
import { useBusyWhile } from "@/components/forms/use-busy-while";

/**
 * Answer one request: turn it into work, or reply without building it.
 *
 * Two forms rather than one with a mode switch, because they do genuinely
 * different things — one creates a task, the other records a decision — and a
 * single form that branches on a hidden field is the kind that eventually
 * declines something it meant to accept.
 *
 * Nothing is pre-selected. A default answer on a screen like this is an answer
 * somebody gives by pressing enter, and the client is the one who finds out.
 */
export function TriageForm({
  requestId,
  projectId,
  title,
}: {
  requestId: string;
  projectId: string;
  title: string;
}) {
  const [mode, setMode] = useState<"none" | "convert" | "reply">("none");

  if (mode === "none") {
    return (
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={() => setMode("convert")}>Turn into a task</Button>
        <Button variant="secondary" onClick={() => setMode("reply")}>
          Answer without building it
        </Button>
      </div>
    );
  }

  return mode === "convert" ? (
    <ConvertForm
      requestId={requestId}
      projectId={projectId}
      title={title}
      onCancel={() => setMode("none")}
    />
  ) : (
    <ReplyForm requestId={requestId} onCancel={() => setMode("none")} />
  );
}

function ConvertForm({
  requestId,
  projectId,
  title,
  onCancel,
}: {
  requestId: string;
  projectId: string;
  title: string;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(convertRequest, idleState);
  useBusyWhile(pending, "Working");

  return (
    <form action={action} className="mt-5 space-y-4 border-t border-border pt-5">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="project_id" value={projectId} />

      <Field
        label="Task title"
        required
        hint="Their words by default. Change it to what the work actually is."
        error={state.fieldErrors?.title}
      >
        {(id, describedBy) => (
          <input
            id={id}
            name="title"
            required
            defaultValue={title}
            maxLength={160}
            aria-describedby={describedBy}
            className={FIELD}
          />
        )}
      </Field>

      <Field label="Estimate in hours" hint="Optional.">
        {(id) => (
          <input
            id={id}
            name="estimate_hours"
            type="number"
            min={0}
            max={999}
            step={0.5}
            inputMode="decimal"
            className={cn(FIELD, "max-w-40")}
          />
        )}
      </Field>

      {/*
        What it costs, and anything else this one request needs recorded.

        Under the scope-change tick on purpose: the tick is what says the
        conversation about price is happening now, and the price belongs next
        to it rather than three screens away in an invoice nobody has raised
        yet.
      */}
      <Field
        label="What it costs"
        hint="Leave blank if nobody has priced it. Zero is a real answer and means we are not charging."
        error={state.fieldErrors?.quoted_amount}
      >
        {(id, describedBy) => (
          <input
            id={id}
            name="quoted_amount"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            placeholder="Not priced"
            aria-describedby={describedBy}
            aria-invalid={state.fieldErrors?.quoted_amount ? true : undefined}
            className={cn(FIELD, "max-w-48")}
          />
        )}
      </Field>

      <ExtraFields />

      <Message state={state} />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <BrandSpinner />
              Adding
            </>
          ) : (
            "Add it to the board"
          )}
        </Button>
        <Button type="button" variant="quiet" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ReplyForm({ requestId, onCancel }: { requestId: string; onCancel: () => void }) {
  const [state, action, pending] = useActionState(triageRequest, idleState);
  useBusyWhile(pending, "Working");

  return (
    <form action={action} className="mt-5 space-y-4 border-t border-border pt-5">
      <input type="hidden" name="request_id" value={requestId} />

      <Field label="What are you telling them?" required>
        {(id) => (
          <select id={id} name="decision" required defaultValue="" className={FIELD}>
            <option value="" disabled>
              Choose
            </option>
            <option value="under_review">We are looking at it</option>
            <option value="accepted">Yes, but not scheduled yet</option>
            <option value="declined">No</option>
          </select>
        )}
      </Field>

      <Field
        label="Why"
        hint="Required for a no. A client told no with no reason simply asks again."
        error={state.fieldErrors?.review_note}
      >
        {(id, describedBy) => (
          <textarea
            id={id}
            name="review_note"
            rows={3}
            maxLength={2000}
            aria-describedby={describedBy}
            aria-invalid={state.fieldErrors?.review_note ? true : undefined}
            className={cn(FIELD, "resize-y")}
          />
        )}
      </Field>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="is_scope_change"
          className="mt-0.5 size-4 shrink-0 rounded-sm border-border-strong text-accent focus:ring-2 focus:ring-accent/20"
        />
        <span>
          <span className="font-medium">This changes what was agreed</span>
          <span className="mt-1 block text-xs text-text-subtle">
            Marks it as a scope change, so the conversation about price happens
            now rather than at the end.
          </span>
        </span>
      </label>

      <Message state={state} />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <BrandSpinner />
              Sending
            </>
          ) : (
            "Send the answer"
          )}
        </Button>
        <Button type="button" variant="quiet" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Message({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message || state.fieldErrors) return null;

  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={cn("text-sm", state.status === "error" ? "text-danger" : "text-success")}
    >
      {state.message}
    </p>
  );
}

/**
 * Anything else worth recording about this one request.
 *
 * ---------------------------------------------------------------------------
 * **Rows, not a settings screen.** What was asked for was somewhere to put the
 * thing *this* request needs — a purchase order number, a date somebody agreed
 * on the phone, which of the client's people signed it off. Defining a field
 * once and having it appear on every request is a different feature, and the
 * wrong one here: most of these are wanted once and never again.
 *
 * A row with no label is dropped rather than saved under an empty key. An
 * unnamed value is not a field, and storing it would leave `"": "12000"` in
 * the record for somebody to puzzle over later.
 */
function ExtraFields() {
  const [rows, setRows] = useState(1);

  return (
    <fieldset>
      <legend className={LABEL}>Anything else worth recording</legend>
      <p className="mt-1 text-xs text-text-subtle">
        Optional. A name and a value — a purchase order number, a date agreed on
        a call, who signed it off.
      </p>

      <div className="mt-2 space-y-2">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex flex-wrap gap-2">
            <input
              name="extra_label"
              placeholder="Name"
              maxLength={60}
              className={cn(FIELD, "min-w-0 flex-1")}
            />
            <input
              name="extra_value"
              placeholder="Value"
              maxLength={300}
              className={cn(FIELD, "min-w-0 flex-[2]")}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((current) => current + 1)}
        className="mt-2 text-sm text-accent underline underline-offset-4"
      >
        Add another
      </button>
    </fieldset>
  );
}
