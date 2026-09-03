import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, Clock, FileText, Inbox } from "lucide-react";
import { Badge } from "@/components/admin/badge";
import { ProgressBar } from "@/components/admin/progress-bar";
import { requireStaff } from "@/lib/auth/session";
import { canReach } from "@/lib/auth/menu";
import { HEALTH_LABEL, HEALTH_TONE } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { getMyTasks, getOpenRequests, getProjects } from "@/lib/queries/admin";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * What needs somebody today.
 *
 * Not a set of totals. A dashboard of counts tells you the shape of the
 * business and nothing about what to do next, and the second kind is what
 * somebody opens a panel for at nine in the morning.
 *
 * So every card here is a thing that is waiting: a proposal nobody has chased, a
 * request nobody has answered, a task that is blocked, a project that has gone
 * past its date. Each one links straight to the thing rather than to a list
 * containing it.
 *
 * Every section is behind the same permission as the screen it links to. A
 * developer who cannot reach Clients does not get a card counting them —
 * a dashboard that shows you a door you cannot open is worse than one that
 * does not mention the door.
 */
export default async function DashboardPage() {
  const session = await requireStaff();
  const staff = session.staff;

  const [projects, requests, myTasks] = await Promise.all([
    /* The dashboard summarises everything, so the whole list. */
    canReach(staff, "projects")
      ? getProjects().then((result) => result.rows)
      : Promise.resolve([]),
    /* The dashboard counts them all, so the whole queue. */
    canReach(staff, "requests")
      ? getOpenRequests().then((result) => result.rows)
      : Promise.resolve([]),
    getMyTasks(staff.id),
  ]);

  const proposals = projects.filter((project) => !project.approved_at);
  const struggling = projects.filter(
    (project) => project.approved_at && project.health !== "on_track",
  );
  const blocked = myTasks.filter((task) => task.status === "blocked");
  const waitingLong = requests.filter((request) => request.waitingDays >= 7);

  const quiet =
    proposals.length === 0 &&
    struggling.length === 0 &&
    blocked.length === 0 &&
    requests.length === 0;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header>
        <h1 className="text-2xl font-semibold">Hello, {staff.full_name}</h1>
        <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
          What is waiting. Everything here links straight to the thing itself.
        </p>
      </header>

      {quiet && (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-surface-2/40 p-8">
          <h2 className="text-lg font-semibold">Nothing is waiting</h2>
          <p className="measure mt-3 text-sm leading-relaxed text-text-muted">
            No unanswered requests, no blocked work, nothing past its date and no
            proposal sitting unchased. This is the state the panel should usually
            be in.
          </p>
        </div>
      )}

      <div className="mt-10 space-y-6">
        {proposals.length > 0 && (
          <Card
            icon={<FileText className="size-4" />}
            title={`${proposals.length} proposal${proposals.length === 1 ? "" : "s"} waiting on a client`}
            body="Sent and not yet accepted. This is the pile with money in it and the least attention on it."
          >
            <ul className="mt-4 space-y-2">
              {proposals.slice(0, 5).map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.slug}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm transition-colors hover:bg-surface-2"
                  >
                    <span className="font-medium">{project.name}</span>
                    <span className="text-text-subtle">
                      {project.contract_value
                        ? formatMoney(project.contract_value, project.currency)
                        : "No price yet"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {requests.length > 0 && (
          <Card
            icon={<Inbox className="size-4" />}
            title={`${requests.length} request${requests.length === 1 ? "" : "s"} unanswered`}
            body={
              waitingLong.length > 0
                ? `${waitingLong.length} of them have been waiting a week or more. That client has heard nothing.`
                : "Clients have asked for something and nobody has replied yet."
            }
          >
            <Link
              href="/requests"
              className="mt-4 inline-block text-sm font-medium text-accent underline underline-offset-4"
            >
              Answer them
            </Link>
          </Card>
        )}

        {blocked.length > 0 && (
          <Card
            icon={<AlertCircle className="size-4" />}
            title={`${blocked.length} of your tasks ${blocked.length === 1 ? "is" : "are"} blocked`}
            body="Work that has stopped, with a reason recorded on each."
          >
            <ul className="mt-4 space-y-2">
              {blocked.map((task) => (
                <li key={task.id} className="rounded-lg border border-border px-4 py-3 text-sm">
                  <p className="font-medium">{task.title}</p>
                  {task.blocked_reason && (
                    <p className="mt-1 text-text-muted">{task.blocked_reason}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {struggling.length > 0 && (
          <Card
            icon={<Clock className="size-4" />}
            title={`${struggling.length} project${struggling.length === 1 ? "" : "s"} off track`}
            body="At risk or already past a target date. Worked out from the dates against the work done, not judged by anybody."
          >
            <ul className="mt-4 space-y-3">
              {struggling.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.slug}`}
                    className="block rounded-lg border border-border px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-medium">{project.name}</span>
                      <Badge tone={HEALTH_TONE[project.health]}>
                        {HEALTH_LABEL[project.health]}
                      </Badge>
                    </div>
                    <ProgressBar
                      className="mt-3"
                      value={project.progress_percent}
                      label={`${project.name} progress`}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="text-accent">{icon}</span>
        {title}
      </h2>
      <p className="measure mt-2 text-sm leading-relaxed text-text-muted">{body}</p>
      {children}
    </section>
  );
}
