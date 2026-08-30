import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/admin/badge";
import { MoveTask } from "@/components/admin/move-task";
import { requireMenu } from "@/lib/auth/session";
import { BOARD_COLUMNS, TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, TASK_TONE } from "@/lib/labels";
import { getMyTasks, getUnassignedTasks, type BoardTask } from "@/lib/queries/admin";
import { formatDate } from "@/lib/utils";

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

  return (
    <div className="mx-auto w-full max-w-7xl">
      <header>
        <h1 className="text-2xl font-semibold">My board</h1>
        <p className="measure mt-2 text-sm leading-relaxed text-text-muted">
          Everything assigned to you. Moving a task moves the client&rsquo;s
          percentage with it — that figure is worked out from these rows and is
          not typed anywhere.
        </p>
      </header>

      {mine.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-border bg-surface-2/40 p-8 text-sm leading-relaxed text-text-muted">
          Nothing is assigned to you. Anything waiting for somebody to pick it up
          is below.
        </p>
      ) : (
        <div className="mt-10 grid gap-6 lg:grid-cols-3 xl:grid-cols-5">
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

                <ul className="mt-3 space-y-3">
                  {inColumn.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

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
