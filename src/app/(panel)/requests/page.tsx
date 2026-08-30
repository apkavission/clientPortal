import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/admin/badge";
import { requireMenu } from "@/lib/auth/session";
import { REQUEST_STATUS_LABEL, REQUEST_TONE } from "@/lib/labels";
import { getOpenRequests } from "@/lib/queries/admin";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Requests" };

/**
 * What clients have asked for and nobody has answered.
 *
 * Oldest first, deliberately. The oldest unanswered request is the one doing the
 * damage — that client has been waiting longest and has heard nothing — and
 * newest-first ordering hides exactly the row that most needs attention.
 *
 * Requests arrive from the client's own application, which is a separate
 * project. This screen only answers them, and there are three answers: turn it
 * into work, say no with a reason, or say it is being looked at. There is no way
 * to leave one silently — the table refuses a decline with no note.
 */
export default async function RequestsPage() {
  await requireMenu("requests");

  const requests = await getOpenRequests();

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header>
        <h1 className="text-2xl font-semibold">Requests</h1>
        <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
          Everything clients have asked for that has not been answered. A request
          is not work until somebody here turns it into a task — which is what
          keeps a fixed price fixed.
        </p>
      </header>

      {requests.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-border bg-surface-2/40 p-8 text-sm leading-relaxed text-text-muted">
          Nothing waiting. That is the state this page should usually be in.
        </p>
      ) : (
        <ul className="mt-10 space-y-4">
          {requests.map((request) => (
            <li key={request.id} className="rounded-2xl border border-border bg-surface p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  {request.project && (
                    <Link
                      href={`/projects/${request.project.slug}`}
                      className="text-xs text-text-subtle underline-offset-2 hover:underline"
                    >
                      {request.project.name}
                    </Link>
                  )}
                  <h2 className="mt-1 font-medium">{request.title}</h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={REQUEST_TONE[request.status]}>
                    {REQUEST_STATUS_LABEL[request.status]}
                  </Badge>
                  {/*
                    A week is the point at which a client assumes they were
                    ignored. Marked, rather than left to be worked out from a
                    date somebody has to subtract in their head.
                  */}
                  {request.waitingDays >= 7 && (
                    <Badge tone="danger">Waiting {request.waitingDays} days</Badge>
                  )}
                </div>
              </div>

              {request.description && (
                <p className="measure mt-3 text-sm leading-relaxed text-text-muted">
                  {request.description}
                </p>
              )}

              <p className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-subtle">
                <span>Sent {formatDate(request.created_at)}</span>
                {/*
                  Deciding starts by reading. The thread is where the client has
                  been asked what they meant and has answered — and until a
                  request is approved, this panel is the only place any of it can
                  be seen at all.
                */}
                <Link
                  href={`/requests/${request.id}`}
                  className="font-medium text-accent underline-offset-2 hover:underline"
                >
                  Open the conversation and decide it
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
