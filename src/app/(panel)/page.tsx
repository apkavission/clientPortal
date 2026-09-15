import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, Clock, FileText, Inbox } from "lucide-react";
import { Badge } from "@/components/admin/badge";
import { ProgressBar } from "@/components/admin/progress-bar";
import { PageHead } from "@/components/ui/page-head";
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
 *
 * ---------------------------------------------------------------------------
 * **The layout was the problem, not the content.**
 *
 * All four cards were stacked in one column down the left of a 1440px window,
 * so on a normal morning — one unanswered request, nothing else — the first
 * thing anybody saw when they signed in was a single small box and about eight
 * hundred pixels of empty grey. The panel looked broken, or unfinished, or like
 * it had failed to load. It was none of those; it was working exactly as
 * designed and saying "one thing needs you", which is good news badly told.
 *
 * Now the count strip answers the question at a glance before any card is read,
 * and the cards sit in a two-column grid that fills the width it was given. The
 * queries and the permissions are untouched.
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

  /*
    The strip across the top: four figures, each the count of one card below.

    Deliberately the same four things, not four different ones. A summary that
    counts something the page does not then show is a number nobody can act on,
    and the point of every figure here is that it has somewhere to go.
  */
  const counts = [
    { label: "Proposals waiting", value: proposals.length, href: "/projects" },
    { label: "Requests unanswered", value: requests.length, href: "/requests" },
    { label: "Your blocked tasks", value: blocked.length, href: "/board" },
    { label: "Projects off track", value: struggling.length, href: "/projects" },
  ];

  /*
    Two columns only when there is something to put in the second one.

    A grid of `lg:grid-cols-2` holding a single card draws that card at half the
    width of the screen with an empty column beside it, which reads as a panel
    that failed to load the other half rather than as a morning with one thing
    to do. Counted rather than assumed, because which cards appear depends
    entirely on what is waiting.
  */
  const cards =
    (proposals.length > 0 ? 1 : 0) +
    (requests.length > 0 ? 1 : 0) +
    (blocked.length > 0 ? 1 : 0) +
    (struggling.length > 0 ? 1 : 0);

  return (
    <div className="mx-auto w-full max-w-6xl pb-16">
      <PageHead
        title={`Hello, ${staff.full_name}`}
        lede="What is waiting. Everything here links straight to the thing itself."
      />

      <ul className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {counts.map((count, index) => (
          <li
            key={count.label}
            className="enter"
            style={{ "--enter": 1 + index } as React.CSSProperties}
          >
            {/*
              A figure of nought is not a link. There is nothing on the other
              side of it worth the journey, and a row of four live links of
              which three lead to an empty list teaches people not to trust the
              fourth.
            */}
            {count.value > 0 ? (
              <Link
                href={count.href}
                className="stat panel-link group flex h-full flex-col justify-between"
              >
                <span className="stat-figure">{count.value}</span>
                <span className="mt-2 flex items-center gap-1.5 text-sm text-text-muted">
                  {count.label}
                  <ArrowRight
                    className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </Link>
            ) : (
              <div className="stat flex h-full flex-col justify-between opacity-60">
                <span className="stat-figure text-text-subtle">0</span>
                <span className="mt-2 block text-sm text-text-muted">
                  {count.label}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>

      {quiet && (
        <div
          className="enter panel mt-8 border-dashed p-8 text-center"
          style={{ "--enter": 5 } as React.CSSProperties}
        >
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
            <Check className="size-5" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Nothing is waiting</h2>
          <p className="measure mx-auto mt-3 text-sm leading-relaxed text-text-muted">
            No unanswered requests, no blocked work, nothing past its date and no
            proposal sitting unchased. This is the state the panel should usually
            be in.
          </p>
        </div>
      )}

      {/*
        Two columns from `lg`, and each card decides its own height rather than
        stretching to match its neighbour: a card holding one link should not be
        padded out to the height of one holding five projects.
      */}
      <div
        className={`mt-8 grid items-start gap-5 ${cards > 1 ? "lg:grid-cols-2" : "grid-cols-[minmax(0,1fr)]"}`}
      >
        {proposals.length > 0 && (
          <Card
            order={5}
            icon={<FileText className="size-4" />}
            title={`${proposals.length} proposal${proposals.length === 1 ? "" : "s"} waiting on a client`}
            body="Sent and not yet accepted. This is the pile with money in it and the least attention on it."
          >
            <ul className="mt-5 space-y-2">
              {proposals.slice(0, 5).map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.slug}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm transition-colors hover:border-border-strong hover:bg-surface-2"
                  >
                    <span className="font-medium">{project.name}</span>
                    <span className="text-xs tabular-nums text-text-subtle">
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
            order={6}
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
              className="group mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent"
            >
              Answer them
              <ArrowRight
                className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </Card>
        )}

        {blocked.length > 0 && (
          <Card
            order={6}
            icon={<AlertCircle className="size-4" />}
            title={`${blocked.length} of your tasks ${blocked.length === 1 ? "is" : "are"} blocked`}
            body="Work that has stopped, with a reason recorded on each."
          >
            <ul className="mt-5 space-y-2">
              {blocked.map((task) => (
                <li
                  key={task.id}
                  className="rounded-xl border border-border px-4 py-3 text-sm"
                >
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
            order={6}
            icon={<Clock className="size-4" />}
            title={`${struggling.length} project${struggling.length === 1 ? "" : "s"} off track`}
            body="At risk or already past a target date. Worked out from the dates against the work done, not judged by anybody."
          >
            <ul className="mt-5 space-y-3">
              {struggling.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.slug}`}
                    className="block rounded-xl border border-border px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-2"
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

/**
 * One thing that is waiting.
 *
 * `order` sets where the card falls in the arrival sequence. It is passed in
 * rather than worked out from the array index because the cards are rendered
 * conditionally: an index would count only the cards that happen to be on
 * screen, so the same card would arrive at a different moment depending on what
 * else was waiting that morning.
 */
function Card({
  icon,
  title,
  body,
  order,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  order: number;
  children?: React.ReactNode;
}) {
  return (
    <section
      className="enter panel p-6"
      style={{ "--enter": order } as React.CSSProperties}
    >
      <h2 className="flex items-start gap-2.5 text-base font-semibold">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          {icon}
        </span>
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">{body}</p>
      {children}
    </section>
  );
}
