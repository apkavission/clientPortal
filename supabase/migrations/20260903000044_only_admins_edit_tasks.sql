-- ===========================================================================
-- Moving a card is not editing a task.
--
-- ---------------------------------------------------------------------------
-- **The owner's rule:** an employee may add a task and drag it across the
-- board; changing what the task *says* — its title, what it is worth, when it
-- is due, whether the client can see it — is an admin's job.
--
-- The update policy could not express that. It allowed anybody on the project
-- to write any column, so "drag this to In Review" and "rewrite the title and
-- make it client-visible" were the same permission.
--
-- Row-level security is per row, not per column, so this is a trigger. It is
-- the same shape as every other rule in this schema — refused by the database
-- with a sentence worth showing, rather than by a hidden button.
--
-- ---------------------------------------------------------------------------
-- **What a non-admin may still change**, and why each one:
--
--   status          the board. Dragging a card is the whole point.
--   sort_order      dragging within a column.
--   blocked_reason  set when a card is dropped into Blocked.
--   completed_at    written by `sync_task_completed_at`, not by a person.
--   logged_hours    written by `recount_logged_hours` when time is recorded.
--   assignee_id     written by `tasks_sync_primary_assignee` when the people on
--                   a task change, which the move modal does.
--   updated_at      written by `set_updated_at`.
--
-- The last four are triggers rather than people. They are listed because a
-- trigger's write is still an update to this one, and refusing them would make
-- the board unusable in a way that looks like a permissions bug.
-- ===========================================================================

create or replace function portal.tasks_only_admins_edit()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
begin
  if portal.is_admin() then
    return new;
  end if;

  /*
    Compared column by column rather than by hashing the row: a new column
    added later is then *allowed* by default rather than silently refused,
    which is the failure that would present as "the board stopped working"
    with nothing pointing here.

    `is distinct from` throughout, so a column going to or from null is a
    change rather than NULL — the mistake that let one person edit another's
    message on 2026-09-02.
  */
  if new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.priority is distinct from old.priority
    or new.due_date is distinct from old.due_date
    or new.estimate_hours is distinct from old.estimate_hours
    or new.is_client_visible is distinct from old.is_client_visible
    or new.project_id is distinct from old.project_id
    or new.phase_id is distinct from old.phase_id
    or new.requirement_id is distinct from old.requirement_id
  then
    raise exception 'Only an admin can change what a task says. You can move it on the board.'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

comment on function portal.tasks_only_admins_edit() is
  'Lets anybody on a project move a card and refuses everything that changes what the task says. Row-level security is per row, not per column, so the rule lives here.';

create trigger tasks_edit_is_admin_only
  before update on portal.tasks
  for each row execute function portal.tasks_only_admins_edit();
