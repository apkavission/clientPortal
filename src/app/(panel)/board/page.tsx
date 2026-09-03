import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/admin/badge";
import { MoveTask } from "@/components/admin/move-task";
import { requireMenu } from "@/lib/auth/session";
import { BOARD_COLUMNS, TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, TASK_TONE } from "@/lib/labels";
import { getMyTasks, getUnassignedTasks, type BoardTask } from "@/lib/queries/admin";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "My board" };

/**
 * One person's work, across every project.
 *
 * The default is "mine", not "everything". A board that opens on every task in
 * the company has to be filtered before it is useful, and a board people filter
 * every morning is a board they stop opening.
 *
 * The unassigned strip underneath is what stops work disappearing. A task with
 * no assignee belongs to nobody, and nobody is exactly who checks on it; putting
 * it where the whole team walks past is the cheapest fix for that.
 */
export default async function BoardPage() {
  const session = await requireMenu("board");

  const [mine, unassigned] = await Promise.all([
    getMyTasks(session.staff.id),
    getUnassignedTasks(),
  ]);

  /* Past its due date and not finished. Compared as `yyyy-mm-dd` strings, which
     is what the column holds — parsing them to Date only to compare would drag
     the reader's timezone into a question that has nothing to do with it. */
  const todayIso = new Date().toISOString().slice(0, 10);
  const overdue = mine.filter(
    (task) => task.status !== "done" && task.due_date && task.due_date < todayIso,
  ).length;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <header>
        <h1 className="text-2xl font-semibold">My board</h1>
        <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
          Everything assigned to you, across every project, in the order work
          moves: to do, then in progress, in review, blocked, done. Move a card
          with the control at the bottom of it — and moving one moves the
          client&rsquo;s percentage with it, because that figure is worked out
          from these rows rather than typed anywhere.
        </p>
      </header>

      {/*
        What is actually on this person's plate, in one line.

        The columns say where everything is; they do not say what needs a
        decision today. Blocked and overdue are the two that do, so they are
        counted here rather than left to be spotted by reading five columns.
      */}
      <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2">
        <Tally label="Assigned to you" value={mine.length} />
        <Tally
          label="In progress"
          value={mine.filter((task) => task.status === "in_progress").length}
        />
        <Tally
          label="Blocked"
          value={mine.filter((task) => task.status === "blocked").length}
          urgent
        />
        <Tally label="Overdue" value={overdue} urgent />
        <Tally label="Waiting for somebody" value={unassigned.length} />
      </dl>

      {/*
        The columns are drawn even when every one of them is empty.

        They used to be replaced by a single sentence saying nothing was
        assigned, which meant the one person most likely to be new to this
        screen — somebody with no work yet — was the only person who never saw
        what it does. The empty board explains itself; a paragraph where the
        board should be does not.
      */}
      {mine.length === 0 && (
        <p className="mt-8 rounded-xl border border-dashed border-border bg-surface-2/40 p-4 text-sm text-text-muted">
          Nothing is assigned to you yet. Anything waiting for somebody to pick
          it up is at the bottom of this page.
        </p>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {BOARD_COLUMNS.map((column) => {
            const inColumn = mine.filter((task) => task.status === column);

            return (
              <section key={column} className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-medium text-text-muted">
                  {TASK_STATUS_LABEL[column]}
                  <span className="font-mono text-xs text-text-subtle">
                    {inColumn.length}
                  </span>
                </h2>

                {/* An empty column says so rather than being a blank gap. The
                    shape of the board is the explanation of it. */}
                {inColumn.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-text-subtle">
                    Nothing here
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {inColumn.map((task) => (
                      <TaskCard key={task.id} task={task} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
      </div>

      <section className="mt-16">
        <h2 className="text-base font-semibold">Waiting for somebody</h2>
        <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
          Open work with no assignee. A task nobody owns is a task nobody checks.
        </p>

        {unassigned.length === 0 ? (
          <p className="mt-4 text-sm text-text-subtle">Nothing unassigned.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {unassigned.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * One figure from the line at the top.
 *
 * `urgent` colours a count that is not zero. Zero is never coloured — a board
 * with nothing blocked should look calm, and a red 0 trains people to ignore
 * red.
 */
function Tally({
  label,
  value,
  urgent,
}: {
  label: string;
  value: number;
  urgent?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-text-subtle">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          urgent && value > 0 ? "text-danger" : "text-text",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function TaskCard({ task }: { task: BoardTask }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      {task.project && (
        <Link
          href={`/projects/${task.project.slug}`}
          className="text-xs text-text-subtle underline-offset-2 hover:underline"
        >
          {task.project.name}
        </Link>
      )}

      <p className="mt-1.5 font-medium">{task.title}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone={TASK_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
        {task.priority !== "normal" && (
          <Badge tone={task.priority === "urgent" ? "danger" : "warning"}>
            {TASK_PRIORITY_LABEL[task.priority]}
          </Badge>
        )}
        {!task.is_client_visible && <Badge>Internal</Badge>}
      </div>

      {task.status === "blocked" && task.blocked_reason && (
        <p className="mt-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          {task.blocked_reason}
        </p>
      )}

      {task.due_date && (
        <p className="mt-2 text-xs text-text-subtle">Due {formatDate(task.due_date)}</p>
      )}

      <MoveTask taskId={task.id} status={task.status} />
    </li>
  );
}
