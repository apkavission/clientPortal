import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewProjectForm } from "@/components/admin/new-project-form";
import { requireMenu } from "@/lib/auth/session";
import { getClients } from "@/lib/queries/admin";

export const metadata: Metadata = { title: "New project" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewProjectPage({ searchParams }: Props) {
  await requireMenu("projects");

  const query = await searchParams;
  const preselected = typeof query.client === "string" ? query.client : null;
  const clients = await getClients();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/projects"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Projects
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">New project</h1>

      {clients.length === 0 ? (
        <p className="measure mt-6 rounded-2xl border border-dashed border-border bg-surface-2/40 p-6 text-sm leading-relaxed text-text-muted">
          There are no clients yet, and a project belongs to one.{" "}
          <Link href="/clients/new" className="text-accent underline underline-offset-4">
            Add a client first.
          </Link>
        </p>
      ) : (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <NewProjectForm clients={clients} preselected={preselected} />
        </div>
      )}
    </div>
  );
}
