"use client";

import { useActionState, useEffect, useRef } from "react";
import { EyeOff, MessageSquare, Send } from "lucide-react";
import { BrandSpinner } from "@/components/brand/brand-loader";
import { Button } from "@/components/ui/button";
import { FIELD } from "@/components/ui/field";
import { sendProjectMessage } from "@/lib/actions/project-chat";
import { idleState } from "@/lib/actions/state";
import { cn, formatDate } from "@/lib/utils";
import { useBusyWhile } from "@/components/forms/use-busy-while";

export interface ProjectMessage {
  id: string;
  author_name: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  from_client: boolean;
}

/**
 * The project's own conversation.
 *
 * The same screen as the tracker's, written out rather than shared — no project
 * in this estate imports another's code, so a change made there cannot alter
 * what is shown here.
 *
 * **Newest at the bottom, like every conversation people have ever had.** A
 * reverse-ordered chat reads correctly for the person who wrote the last
 * message and backwards for everybody else.
 *
 * **Staff get one extra tick: keep it internal.** A client never sees the tick,
 * and could not use it if they did — the database refuses an internal message
 * from a client outright.
 *
 * The last twenty are shown. A conversation is read from the end; the ones
 * before that are history, and history that has to be scrolled past to reach
 * today is a screen people stop opening.
 */
export function ProjectChat({
  projectId,
  messages,
  canWriteInternal,
}: {
  projectId: string;
  messages: ProjectMessage[];
  canWriteInternal: boolean;
}) {
  const [state, action, pending] = useActionState(sendProjectMessage, idleState);
  useBusyWhile(pending, "Sending project message");
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="size-4" aria-hidden />
        About this project
        {messages.length > 0 && (
          <span className="font-mono text-xs font-normal text-text-subtle">
            {messages.length}
          </span>
        )}
      </h2>

      <p className="measure mt-1 text-xs text-text-subtle">
        Anything that is not about one task or one request. Everything said here
        stays with the project.
      </p>

      {messages.length > 0 && (
        <ul className="mt-4 space-y-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                "rounded-xl border p-3.5",
                message.is_internal
                  ? "border-warning/40 bg-warning-soft"
                  : message.from_client
                    ? "border-border bg-surface-2"
                    : "border-border",
              )}
            >
              <p className="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
                <span className="font-medium text-text">{message.author_name}</span>
                {message.from_client && <span>· client</span>}
                <span>· {formatDate(message.created_at)}</span>
                {message.is_internal && (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <EyeOff className="size-3" aria-hidden />
                    team only
                  </span>
                )}
              </p>

              <p className="measure mt-1.5 whitespace-pre-line text-sm leading-relaxed">
                {message.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form ref={form} action={action} className="mt-4 space-y-3">
        <input type="hidden" name="project_id" value={projectId} />

        <label className="sr-only" htmlFor={`say-${projectId}`}>
          Your message
        </label>
        <textarea
          id={`say-${projectId}`}
          name="body"
          rows={2}
          required
          maxLength={4000}
          placeholder="Say something about the project…"
          className={cn(FIELD, "resize-y")}
        />

        {state.fieldErrors?.body && (
          <p role="alert" className="text-sm text-danger">
            {state.fieldErrors.body}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {canWriteInternal ? (
            <label className="flex items-center gap-2 text-sm text-text-muted">
              <input
                type="checkbox"
                name="internal"
                className="size-4 rounded border-border-strong text-accent focus:ring-2 focus:ring-accent/20"
              />
              Only the team sees this
            </label>
          ) : (
            <span />
          )}

          <Button type="submit" disabled={pending}>
            {pending ? <BrandSpinner /> : <Send className="size-4" aria-hidden />}
            {pending ? "Sending" : "Send"}
          </Button>
        </div>

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
      </form>
    </section>
  );
}
