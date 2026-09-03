import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, EyeOff, Lock } from "lucide-react";
import { Badge } from "@/components/admin/badge";
import { ApproveRequest, MessageBox } from "@/components/admin/request-conversation";
import { TriageForm } from "@/components/admin/triage-form";
import { requireMenu } from "@/lib/auth/session";
import { REQUEST_STATUS_LABEL, REQUEST_TONE } from "@/lib/labels";
import { getRequestThread } from "@/lib/queries/requests";
import { formatMoney } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireMenu("requests");
  const { id } = await params;
  const thread = await getRequestThread(id);
  return { title: thread?.request.title ?? "Request" };
}

/**
 * One request, and the conversation that decides it.
 *
 * The owner's rule, 2026-08-30: before a request is approved it is a
 * conversation between the client and whoever runs the project, **and it is
 * visible only here**. No developer sees it — not a filtered version, nothing at
 * all, enforced by the row policy on `client_requests`.
 *
 * So this screen is where the deciding happens, and it holds the three things
 * that decision needs: what was asked, everything that has been said about it,
 * and where the project stands — because "does this cost them one of their three
 * changes" cannot be answered without the last one.
 */
export default async function RequestThreadPage({ params }: Props) {
  await requireMenu("requests");

  const { id } = await params;
  const thread = await getRequestThread(id);
  if (!thread) notFound();

  const { request, project, client, messages, changesUsed, unfinished } = thread;

  const approved = Boolean(request.approved_at);

  /* `extra` is jsonb: an object by constraint, but still `Json` to TypeScript,
     so it is narrowed here rather than trusted. Only string values are shown —
     anything else was written by something other than this form. */
  const extraPairs =
    request.extra && typeof request.extra === "object" && !Array.isArray(request.extra)
      ? Object.entries(request.extra as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        )
      : [];
  const delivered = Boolean(project.scope_delivered_at);
  const changesLeft = Math.max(0, (project.change_limit ?? 0) - changesUsed);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/requests"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Requests
      </Link>

      <header className="mt-4">
        <Link
          href={`/projects/${project.slug}`}
          className="text-xs text-text-subtle underline-offset-2 hover:underline"
        >
          {project.name}
        </Link>

        <h1 className="mt-1 text-2xl font-semibold">{request.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={REQUEST_TONE[request.status]}>
            {REQUEST_STATUS_LABEL[request.status]}
          </Badge>
          {request.is_urgent && <Badge tone="danger">Client says urgent</Badge>}
          {request.change_number !== null && (
            <Badge tone="accent">Change {request.change_number}</Badge>
          )}
          {!approved && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-text-muted">
              <Lock className="size-3" aria-hidden />
              Not visible to the team
            </span>
          )}
        </div>

        <p className="mt-2 text-xs text-text-subtle">
          {client ? `${client} · ` : ""}
          {formatDate(request.created_at)}
        </p>
      </header>

      {/*
        What it costs, and anything else recorded about it.

        Shown near the top rather than beside the answer, because the price is
        what the next conversation is about — and "not priced" is printed
        rather than left blank, since a missing figure and a figure of nothing
        are different answers and only one of them is a promise.
      */}
      {(request.quoted_amount !== null || extraPairs.length > 0) && (
        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 border-t border-border pt-5">
          <div>
            <dt className="text-xs text-text-subtle">What it costs</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">
              {request.quoted_amount === null
                ? "Not priced"
                : formatMoney(request.quoted_amount)}
            </dd>
          </div>

          {extraPairs.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-text-subtle">{label}</dt>
              <dd className="mt-0.5 text-sm">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      )}

      {request.description && (
        <p className="measure mt-6 whitespace-pre-line text-sm leading-relaxed">
          {request.description}
        </p>
      )}

      {request.is_urgent && request.urgency_reason && (
        <p className="measure mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <span className="font-medium">Why they say it is urgent: </span>
          {request.urgency_reason}
        </p>
      )}

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8">
        <h2 className="text-base font-semibold">
          Conversation
          <span className="ml-2 font-mono text-xs text-text-subtle">{messages.length}</span>
        </h2>

        {messages.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">
            Nothing said yet. Asking what they meant is usually quicker than
            guessing, and it stays on the record either way.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {messages.map((message) => (
              <li
                key={message.id}
                className={cn(
                  "rounded-xl border p-4",
                  message.is_internal
                    ? "border-warning/40 bg-warning-soft"
                    : message.client_user_id
                      ? "border-border bg-surface-2"
                      : "border-border bg-surface",
                )}
              >
                <p className="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
                  <span className="font-medium text-text">{message.author_name}</span>
                  {message.client_user_id && <span>· client</span>}
                  <span>· {formatDate(message.created_at)}</span>
                  {message.is_internal && (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <EyeOff className="size-3" aria-hidden />
                      team only
                    </span>
                  )}
                </p>

                <p className="measure mt-2 whitespace-pre-line text-sm leading-relaxed">
                  {message.body}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <MessageBox requestId={request.id} />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-10 rounded-2xl border border-accent/30 bg-accent-soft/30 p-6">
        <h2 className="text-base font-semibold">
          {approved ? "Approved" : "Decide it"}
        </h2>

        {approved ? (
          <>
            <p className="measure mt-2 text-sm text-text-muted">
              Approved {formatDate(request.approved_at)}
              {request.change_number !== null
                ? ` as change ${request.change_number} of ${project.change_limit}.`
                : ", and not counted against the change allowance."}{" "}
              The team can see it. Turning it into a task is below.
            </p>

            <div className="mt-5">
              <TriageForm
                requestId={request.id}
                projectId={project.id}
                title={request.title}
              />
            </div>
          </>
        ) : (
          <>
            <p className="measure mt-2 text-sm text-text-muted">
              Approving is what makes this work. Until then no developer sees it,
              and it cannot be turned into a task — the database refuses that,
              not just this screen.
            </p>

            <div className="mt-5">
              <ApproveRequest
                requestId={request.id}
                delivered={delivered}
                changesLeft={changesLeft}
                unfinished={unfinished}
              />
            </div>
          </>
        )}

        {project.change_terms && (
          <p className="measure mt-5 border-t border-border pt-4 text-xs leading-relaxed text-text-subtle">
            <span className="font-medium">What counts as a change: </span>
            {project.change_terms}
          </p>
        )}
      </section>
    </div>
  );
}
