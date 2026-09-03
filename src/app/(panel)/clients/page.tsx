import type { Metadata } from "next";
import { Pagination } from "@/components/admin/pagination";
import { requestedPage, resolve } from "@/lib/pagination";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/admin/badge";
import { ButtonLink } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/session";
import { getClients } from "@/lib/queries/admin";

export const metadata: Metadata = { title: "Clients" };

const STATUS_TONE = {
  prospect: "info",
  active: "success",
  paused: "warning",
  closed: "neutral",
} as const;

const STATUS_LABEL = {
  prospect: "Prospect",
  active: "Active",
  paused: "Paused",
  closed: "Closed",
} as const;

/**
 * Who we work for.
 *
 * The company comes before the project, because a project cannot exist without
 * one and the first thing anybody does here is add the client they just spoke
 * to. The empty state says exactly that rather than showing a blank table.
 */
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClientsPage({ searchParams }: Props) {
  await requireMenu("clients");

  /*
    The page comes from the address, not from state.

    So a link to page four is a link to page four — it can be sent to somebody,
    opened in a new tab, and it survives a refresh. A `useState` version is
    shorter and loses the reader's place every time they open a client and come
    back.
  */
  const query = await searchParams;
  const request = requestedPage(query);

  const { rows: clients, total } = await getClients(request);
  const paged = resolve(clients, total, request);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
            Every company we work for, and the projects under each. A client is
            added once; their projects come after.
          </p>
        </div>

        <ButtonLink href="/clients/new">
          <Plus className="size-4" aria-hidden />
          Add a client
        </ButtonLink>
      </header>

      {clients.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-surface-2/40 p-8">
          <h2 className="text-lg font-semibold">Nobody yet</h2>
          <p className="measure mt-3 text-sm leading-relaxed text-text-muted">
            Add the first client and their projects can be set up under them. The
            details entered here — the company name, the address, the GST number
            — are what appear on every document sent to them, so they are worth
            getting right once.
          </p>
        </div>
      ) : (
        <>
        <ul className="mt-10 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/clients/${client.id}`}
                className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{client.company_name ?? client.name}</p>
                  {client.company_name && (
                    <p className="mt-0.5 text-sm text-text-muted">{client.name}</p>
                  )}
                </div>

                <span className="text-sm text-text-subtle">
                  {client.projectCount === 0
                    ? "No projects"
                    : `${client.projectCount} project${client.projectCount === 1 ? "" : "s"}`}
                </span>

                <Badge tone={STATUS_TONE[client.status]}>
                  {STATUS_LABEL[client.status]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>

        <Pagination paged={paged} pathname="/clients" query={query} />
        </>
      )}
    </div>
  );
}
