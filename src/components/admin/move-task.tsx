"use client";

import { useActionState, useState } from "react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { FIELD } from "@/components/ui/field";
import { moveTask } from "@/lib/actions/tasks";
import { idleState } from "@/lib/actions/state";
import { BOARD_COLUMNS, TASK_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types/database";
import { useBusyWhile } from "@/components/forms/use-busy-while";

/**
 * Move one task, from wherever it is shown.
 *
 * A select and a button rather than drag-and-drop. Dragging is pleasant on a
 * laptop and close to unusable on a phone, and a developer updating their board
 * is very often doing it on a phone on the way somewhere. The same control works
 * in both places, and works for a keyboard with no extra code.
 *
 * Choosing Blocked reveals the reason box, because the table refuses a blocked
 * task that does not say why. Asking at the moment of blocking is the difference
 * between a rule that helps and a rule that gets in the way.
 */
export function MoveTask({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const [state, action, pending] = useActionState(moveTask, idleState);
  useBusyWhile(pending, "Working");
  const [chosen, setChosen] = useState<TaskStatus>(status);

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="task_id" value={taskId} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`status-${taskId}`}>
          Status
        </label>
        <select
          id={`status-${taskId}`}
          name="status"
          value={chosen}
          onChange={(event) => setChosen(event.target.value as TaskStatus)}
          className={cn(FIELD, "w-auto py-1.5 text-xs")}
        >
          {BOARD_COLUMNS.map((value) => (
            <option key={value} value={value}>
              {TASK_STATUS_LABEL[value]}
            </option>
          ))}
        </select>

        <Button
          type="submit"
          variant="secondary"
          disabled={pending || chosen === status}
          className="px-3 py-1.5 text-xs"
        >
          {pending ? <BrandSpinner className="size-3" /> : null}
          {pending ? "Saving" : "Move"}
        </Button>
      </div>

      {chosen === "blocked" && (
        <div className="mt-2">
          <label className="sr-only" htmlFor={`reason-${taskId}`}>
            What is blocking it
          </label>
          <input
            id={`reason-${taskId}`}
            name="blocked_reason"
            required
            maxLength={500}
            placeholder="What is blocking it?"
            aria-invalid={state.fieldErrors?.blocked_reason ? true : undefined}
            className={cn(FIELD, "py-1.5 text-xs")}
          />
          {state.fieldErrors?.blocked_reason && (
            <p className="mt-1 text-xs text-danger">{state.fieldErrors.blocked_reason}</p>
          )}
        </div>
      )}

      {state.status === "error" && !state.fieldErrors && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
