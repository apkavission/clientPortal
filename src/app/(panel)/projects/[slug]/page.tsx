import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { ApproveForm } from "@/components/admin/approve-form";
import { Badge } from "@/components/admin/badge";
import { DocumentForm } from "@/components/admin/document-form";
import { PaymentForm } from "@/components/admin/payment-form";
import { ProgressBar } from "@/components/admin/progress-bar";
import { ProjectChat } from "@/components/admin/project-chat";
import { ProjectFiles } from "@/components/admin/project-files";
import { ProjectForm } from "@/components/admin/project-form";
import { ButtonLink } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/session";
import { HEALTH_LABEL, HEALTH_TONE, STAGE_LABEL, TASK_STATUS_LABEL, TASK_TONE } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import {
  getActiveStaff,
  getClients,
  getProjectDetail,
  getProjectMemberIds,
  getProjectMessages,
  getServiceOptions,
} from "@/lib/queries/admin";
import { getClientDocumentKinds, getProjectDocuments } from "@/lib/queries/documents";
import { formatDate } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getProjectDetail(slug);
  return { title: detail?.project.name ?? "Project" };
}

/**
 * One project, and everything about it in one place.
 *
 * The order is the order somebody needs it in, not the order the tables are
 * defined in:
 *
 *   1. **Where it stands** — approved or still a proposal, and the money. Those
 *      two answer almost every question anybody arrives with.
 *   2. **What happens next** — the approval, while it is still a proposal. It is
 *      the single most valuable button on the screen and it disappears once it
 *      has been used, rather than sitting there inviting a second press.
 *   3. **The detail** — the form, which is where everything is written down.
 *   4. **The record** — payments, work, scope, requests.
 *
 * The document is a link rather than a section, because it is a thing you send
 * rather than a thing you read here.
 */
export default async function ProjectPage({ params }: Props) {
  await requireMenu("projects");

  const { slug } = await params;
  const detail = await getProjectDetail(slug);
  if (!detail) notFound();

  const messages = await getProjectMessages(detail.project.id);
  const services = await getServiceOptions();
  /* Every client, for a select rather than a page of them. */
  const { rows: clients } = await getClients();
  const memberIds = await getProjectMemberIds(detail.project.id);

  /* Issued to this client on this project. Read together — neither depends
     on the other, and one after the other is two round trips for one card. */
  const [documentKinds, documents] = await Promise.all([
    getClientDocumentKinds(),
    getProjectDocuments(detail.project.id),
  ]);

  const { project, money, payments, tasks, requirements, requests, leadDeveloper, files } =
    detail;
  /*
    Always fetched, not only before approval.

    This was `project.approved_at ? [] : await getActiveStaff()`, because the
    only thing that needed a staff list was the approval form — the one moment
    a project was given a lead developer. After that the answer to "whose
    project is this" was fixed for good, and the list it would have needed to
    change was deliberately empty.

    It has to be changeable: people leave, projects are handed over, and the
    client's messages are meant to reach whoever actually holds it.
  */
  const staff = await getActiveStaff();

  const openRequests = requests.filter(
    (request) => request.status === "submitted" || request.status === "under_review",
  ).length;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link
        href="/projects"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Projects
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{STAGE_LABEL[project.stage]}</Badge>
            {project.approved_at ? (
              <Badge tone={HEALTH_TONE[project.health]}>
                {HEALTH_LABEL[project.health]}
              </Badge>
            ) : (
              <Badge tone="warning">Proposal — not approved yet</Badge>
            )}
          </div>

          <h1 className="mt-3 text-2xl font-semibold">{project.name}</h1>
          {project.client && (
            <Link
              href={`/clients/${project.client.id}`}
              className="mt-1 inline-block text-sm text-text-muted underline-offset-4 hover:text-text hover:underline"
            >
              {project.client.company_name ?? project.client.name}
            </Link>
          )}
        </div>

        <ButtonLink href={`/projects/${project.slug}/document`} variant="secondary">
          <FileText className="size-4" aria-hidden />
          The document
        </ButtonLink>
      </header>

      {/* 1 — where it stands ------------------------------------------------ */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-sm font-medium text-text-muted">Money</h2>

          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Quoted" value={formatMoney(money.quoted, project.currency)} />
            {money.discount > 0 && (
              <Row label="Discount" value={`− ${formatMoney(money.discount, project.currency)}`} />
            )}
            <Row
              label="Total"
              value={formatMoney(money.total, project.currency)}
              strong
            />
            <Row label="Paid" value={formatMoney(money.paid, project.currency)} />
            <Row
              label={money.overpaid > 0 ? "In credit" : "Outstanding"}
              value={formatMoney(
                money.overpaid > 0 ? money.overpaid : money.outstanding,
                project.currency,
              )}
              strong
            />
          </dl>

          <ProgressBar className="mt-5" value={money.percentPaid} label="Paid so far" />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-sm font-medium text-text-muted">Where it is</h2>

          <dl className="mt-4 space-y-2 text-sm">
            <Row
              label="Approved"
              value={project.approved_at ? formatDate(project.approved_at) : "Not yet"}
            />
            <Row label="Building it" value={leadDeveloper?.full_name ?? "Nobody assigned"} />
            <Row
              label="Timeline"
              value={
                project.estimated_weeks
                  ? `${project.estimated_weeks} week${project.estimated_weeks === 1 ? "" : "s"}`
                  : "Not set"
              }
            />
            <Row
              label="Target"
              value={project.target_date ? formatDate(project.target_date) : "Not set"}
            />
          </dl>

          {project.approved_at && (
            <ProgressBar
              className="mt-5"
              value={project.progress_percent}
              label="Work done"
            />
          )}
        </div>
      </section>

      {/* 2 — the one action that matters, while it matters ------------------ */}
      {!project.approved_at && (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-base font-semibold">Approval</h2>
          <div className="mt-4">
            <ApproveForm
              projectId={project.id}
              contactName={project.client?.name ?? ""}
              contactEmail={""}
              staff={staff}
            />
          </div>
        </section>
      )}

      {/*
        Files, before the form.

        The form is where a project is written down; this is where the things
        people actually send each other live. Somebody opening this page to find
        the contract should not have to scroll past every field to reach it.
      */}
      <div className="mt-10">
        <ProjectFiles projectId={project.id} files={files} />
      </div>

      <div className="mt-10">
        <ProjectChat
          projectId={project.id}
          messages={messages}
          canWriteInternal
        />
      </div>

      {/* 3 — everything, written down --------------------------------------- */}
      <div className="mt-10">
        <ProjectForm
          project={project}
          services={services}
          staff={staff}
          clients={clients}
          memberIds={memberIds}
        />
      </div>

      {/* 4 — the record ----------------------------------------------------- */}
      <section className="mt-10 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Payments</h2>

        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">Nothing received yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="font-medium tabular-nums">
                  {formatMoney(payment.amount, project.currency)}
                </span>
                <span className="text-text-muted">{formatDate(payment.paid_on)}</span>
                <span className="text-text-subtle">{payment.method}</span>
                {payment.reference && (
                  <span className="font-mono text-xs text-text-subtle">
                    {payment.reference}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <PaymentForm projectId={project.id} />
      </section>

      {/*
        Documents, beside the payments they are usually about.

        An invoice and the payment that settles it are two halves of one
        conversation, and putting them on separate screens means somebody
        checking whether a client has paid has to hold one in their head while
        they look at the other.

        Every kind offered here comes from `document_types`. Nothing on this
        page names one, so a purchase order added next month appears without a
        deploy.
      */}
      <section className="mt-6 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Documents</h2>
        <p className="mt-1 text-sm text-text-muted">
          Issued to {project.client?.name ?? "the client"}. They see these in the
          tracker, and sign there.
        </p>

        {documents.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">Nothing issued yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {documents.map((document) => {
              const company = document.signedBy.find((s) => s.party === "company");
              const client = document.signedBy.find((s) => s.party === "client");

              return (
                <li key={document.id} className="py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium">{document.title}</span>
                    <span className="text-text-subtle">{document.kindLabel}</span>
                    {document.amount && (
                      <span className="tabular-nums">
                        {formatMoney(Number(document.amount), project.currency)}
                      </span>
                    )}
                    <span className="text-text-muted">
                      {formatDate(document.issuedOn)}
                    </span>
                  </div>

                  {/*
                    Said as what is outstanding, not as what is done.

                    "Waiting on the client" is the thing somebody opens this
                    screen to find out. A list of who has signed makes them work
                    out the answer by subtraction.
                  */}
                  {document.needsSignature && (
                    <p className="mt-1 text-xs text-text-subtle">
                      {company && client
                        ? `Signed by both — ${company.name} and ${client.name}`
                        : client
                          ? `Signed by ${client.name}. Waiting on us.`
                          : company
                            ? `Signed by ${company.name}. Waiting on the client.`
                            : "Waiting on both sides."}
                    </p>
                  )}

                  {document.note && (
                    <p className="mt-1 text-sm text-text-muted">{document.note}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <DocumentForm
          projectId={project.id}
          clientId={project.client_id}
          kinds={documentKinds}
        />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Work</h2>
            <span className="font-mono text-xs text-text-subtle">{tasks.length}</span>
          </div>

          {tasks.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">
              No tasks yet, so the client sees 0% — which is correct, and is why an
              empty project should not be shared.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {tasks.slice(0, 8).map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{task.title}</span>
                  <Badge tone={TASK_TONE[task.status]}>
                    {TASK_STATUS_LABEL[task.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Scope</h2>
            <span className="font-mono text-xs text-text-subtle">{requirements.length}</span>
          </div>

          {requirements.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">Nothing itemised yet.</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {requirements.slice(0, 8).map((item) => (
                <li key={item.id} className="truncate">
                  {item.title}
                </li>
              ))}
            </ul>
          )}

          {openRequests > 0 && (
            <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-sm">
              <Link href="/requests" className="underline underline-offset-4">
                {openRequests} request{openRequests === 1 ? "" : "s"} waiting on an answer
              </Link>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-text-muted">{label}</dt>
      <dd className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}
