import type { ZodIssue } from "zod";

/**
 * What every form action gives back.
 *
 * One shape across the application, because `useActionState` needs an initial
 * value and a form that invents its own shape is a form whose error handling
 * has to be read before it can be trusted.
 *
 * `fieldErrors` is keyed by field name so a message lands under the input it
 * belongs to. A single message at the bottom of a form makes the person hunt
 * for which box is wrong, and on a long form they frequently give up.
 */
export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
}

export const idleState: ActionState = { status: "idle" };

/**
 * Zod issues, flattened to one message per field.
 *
 * The first message wins. Showing three sentences under one input is a way of
 * saying nothing three times — the first one is the one that gets read.
 */
export function fieldErrors(issues: ZodIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const issue of issues) {
    const key = issue.path.join(".") || "form";
    if (!errors[key]) errors[key] = issue.message;
  }

  return errors;
}
