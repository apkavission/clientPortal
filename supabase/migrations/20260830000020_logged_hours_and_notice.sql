-- ===========================================================================
-- Two things that were quietly untrue.
--
-- ---------------------------------------------------------------------------
-- 1. `tasks.logged_hours` has always been zero.
--
-- The column exists, the task screen shows it, and **nothing has ever written
-- to it**. `portal.time_entries` was created on day one, given a policy, and
-- left without a screen — so every task in the system reports "Logged 0h",
-- which is not "no time recorded" to somebody reading it. It is a number, and a
-- number is believed.
--
-- Fixed the same way progress is: the database maintains it, and no application
-- is allowed to. A figure that any caller can write is a figure that drifts from
-- the rows it is supposed to summarise, and the day it disagrees is the day
-- somebody is arguing about an invoice.
--
-- ---------------------------------------------------------------------------
-- 2. Nothing ever tells anybody anything.
--
-- A handover offered to somebody who does not open that task is a message in a
-- bottle. Leave waiting on an admin who does not open the leave screen is a
-- person who cannot plan their week. The tracker now has a "waiting on you"
-- screen that counts these, and counting them across three tables on every page
-- load is the sort of query that is fine at ten rows and painful at ten
-- thousand.
--
-- So the indexes it needs go in here, next to the reason they exist.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Logged hours, kept in step by the database.
--
-- Recomputed from the rows rather than added to and subtracted from: an
-- increment is wrong forever after one missed delete, and this is cheap.
-- ---------------------------------------------------------------------------

create or replace function portal.recount_logged_hours()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $$
declare
  target uuid := coalesce(new.task_id, old.task_id);
begin
  update portal.tasks
  set logged_hours = coalesce(
    (select round(sum(minutes)::numeric / 60, 2) from portal.time_entries where task_id = target),
    0
  )
  where id = target;

  return null;
end;
$$;

comment on function portal.recount_logged_hours() is
  'Keeps tasks.logged_hours equal to the sum of its time entries. Nothing else may write that column.';

drop trigger if exists time_entries_recount on portal.time_entries;
create trigger time_entries_recount
  after insert or update or delete on portal.time_entries
  for each row execute function portal.recount_logged_hours();

/*
  Anything already recorded, counted now.

  There is none today — the table has never had a screen — but this migration
  should be correct if it is ever run against a database where somebody inserted
  rows by hand, which is exactly how the first time entries usually arrive.
*/
update portal.tasks t
set logged_hours = coalesce(
  (select round(sum(e.minutes)::numeric / 60, 2) from portal.time_entries e where e.task_id = t.id),
  0
)
where t.logged_hours is distinct from coalesce(
  (select round(sum(e.minutes)::numeric / 60, 2) from portal.time_entries e where e.task_id = t.id),
  0
);

create index if not exists time_entries_task_idx on portal.time_entries (task_id);
create index if not exists time_entries_staff_idx on portal.time_entries (staff_id, logged_on desc);

-- ---------------------------------------------------------------------------
-- What the "waiting on you" screen asks for.
--
-- Three questions, three partial indexes — partial because the interesting rows
-- are always the small minority. An index over every leave request ever made, to
-- find the four that are pending, is most of a table scan with extra steps.
-- ---------------------------------------------------------------------------

create index if not exists task_transfers_waiting_idx
  on portal.task_transfers (to_staff_id) where status = 'pending';

create index if not exists client_requests_unapproved_idx
  on portal.client_requests (project_id) where approved_at is null;

create index if not exists approvals_pending_idx
  on portal.approvals (project_id) where status = 'pending';
