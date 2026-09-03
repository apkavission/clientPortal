import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { ClientForm } from "@/components/admin/client-form";
import { Contacts } from "@/components/admin/contacts";
import { DeleteClient } from "@/components/admin/delete-client";
import { ButtonLink } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/session";
import { getClient, getContacts, getProjects } from "@/lib/queries/admin";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const client = await getClient(id);
  return { title: client?.company_name ?? client?.name ?? "Client" };
}

/**
 * One client: their details, and every project under them.
 *
 * The projects are listed here rather than only on the projects screen, because
 * "what are we doing for this company" is the question this page gets opened
 * with — and the answer being one click away is the difference between a record
 * and a filing cabinet.
 */
export default async function ClientPage({ params }: Props) {
  await requireMenu("clients");

  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const [projects, contacts] = await Promise.all([
    /* This client's projects. Filtered from the whole list rather than a
       page of it — one client has a handful, and paging them would put a
       control under a list of three. */
    getProjects().then(({ rows }) => rows.filter((project) => project.client_id === id)),
    getContacts(id),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/clients"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Clients
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">
        {client.company_name ?? client.name}
      </h1>

      <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Projects</h2>
          <ButtonLink href={`/projects/new?client=${client.id}`} variant="secondary">
            <Plus className="size-4" aria-hidden />
            New project
          </ButtonLink>
        </div>

        {projects.length === 0 ? (
          <p className="measure mt-4 text-sm leading-relaxed text-text-muted">
            Nothing yet for this client.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.slug}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3 text-sm transition-colors hover:bg-surface-2"
                >
                  <span className="font-medium">{project.name}</span>
                  <span className="text-text-subtle">{project.progress_percent}%</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Contacts clientId={client.id} contacts={contacts} />

      <div className="mt-8">
        <ClientForm client={client} />
      </div>

      <div className="mt-12 border-t border-border pt-8">
        <DeleteClient id={client.id} name={client.company_name ?? client.name} />
      </div>
    </div>
  );
}
