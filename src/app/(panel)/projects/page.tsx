import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/admin/badge";
import { ProgressBar } from "@/components/admin/progress-bar";
import { ButtonLink } from "@/components/ui/button";
import { HEALTH_LABEL, HEALTH_TONE, STAGE_LABEL } from "@/lib/labels";
import { requireMenu } from "@/lib/auth/session";
import { getProjects, type ProjectSummary } from "@/lib/queries/admin";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Projects" };

/**
 * Every live job, in two groups.
 *
 * Proposals first, and that ordering is the point of the screen. A project
 * waiting on a client is the one with money sitting in it and the least
 * attention on it — it has been sent, and nobody is looking at it until somebody
 * remembers to chase. Putting it at the top is the cheapest way to be reminded.
 *
 * Health before progress on each card, because a project at 80% that is late
 * needs somebody today and one at 20% that is on track does not.
 */
export default async function ProjectsPage() {
  await requireMenu("projects");

  const projects = await getProjects();
  const proposals = projects.filter((project) => !project.approved_at);
  const live = projects.filter((project) => project.approved_at);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
            A project starts as a proposal. Once the client accepts it, approving
            it here sets up both sign-ins and emails them.
          </p>
        </div>

        <ButtonLink href="/projects/new">
          <Plus className="size-4" aria-hidden />
          New project
        </ButtonLink>
      </header>

      {projects.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-surface-2/40 p-8">
          <h2 className="text-lg font-semibold">Nothing yet</h2>
          <p className="measure mt-3 text-sm leading-relaxed text-text-muted">
            Add a client first, then a project under them.
          </p>
        </div>
      ) : (
        <>
          {proposals.length > 0 && (
            <Group title="Waiting on the client" projects={proposals} />
          )}
          {live.length > 0 && <Group title="Approved" projects={live} />}
        </>
      )}
    </div>
  );
}

function Group({ title, projects }: { title: string; projects: ProjectSummary[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium text-text-muted">
        {title}
        <span className="ml-2 font-mono text-xs text-text-subtle">{projects.length}</span>
      </h2>

      <ul className="mt-3 space-y-3">
        {projects.map((project) => (
          <li key={project.id}>
            <Link
              href={`/projects/${project.slug}`}
              className="block rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-border-strong"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{project.name}</p>
                  {project.client && (
                    <p className="mt-0.5 text-sm text-text-muted">
                      {project.client.company_name ?? project.client.name}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{STAGE_LABEL[project.stage]}</Badge>
                  {project.approved_at ? (
                    <Badge tone={HEALTH_TONE[project.health]}>
                      {HEALTH_LABEL[project.health]}
                    </Badge>
                  ) : (
                    <Badge tone="warning">Proposal</Badge>
                  )}
                </div>
              </div>

              {project.approved_at && (
                <ProgressBar
                  className="mt-4"
                  value={project.progress_percent}
                  label={`${project.name} progress`}
                />
              )}

              {project.target_date && (
                <p className="mt-3 text-xs text-text-subtle">
                  Target {formatDate(project.target_date)}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
