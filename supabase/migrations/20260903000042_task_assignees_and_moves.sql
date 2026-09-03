-- ===========================================================================
-- A task can belong to more than one person, and every move is explained.
--
-- ---------------------------------------------------------------------------
-- **Three things the owner asked for, and they are one change.**
--
--   1. A task may be given to several people at once — "ek task me 2 ya usse
--      jada employe honge" — and it must appear for all of them.
--   2. Moving a card asks who is picking it up and why, and the answer is kept.
--   3. There is a state between "in review" and "done" for work that came back
--      wrong.
--
-- They are one change because they are all about the same missing thing: a task
-- had one owner column and no memory of how it got where it is. Who was asked,
-- by whom, and what they said was nowhere.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Everybody a task belongs to.
-- ---------------------------------------------------------------------------

create table portal.task_assignees (
  task_id uuid not null references portal.tasks (id) on delete cascade,
  staff_id uuid not null references portal.staff (id) on delete cascade,

  /* Who gave it to them, kept as a name as well as a reference: the owner
     asked to see "kisne task assign" in the admin, and that has to still read
     correctly after somebody leaves. */
  assigned_by uuid references portal.staff (id) on delete set null,
  assigned_by_name text,
  assigned_at timestamptz not null default now(),

  primary key (task_id, staff_id)
);

comment on table portal.task_assignees is
  'Everybody a task is assigned to. tasks.assignee_id is superseded by this and kept in step by a trigger, so older queries keep working.';

create index task_assignees_staff_idx on portal.task_assignees (staff_id);

/* Everything already assigned, moved across. */
insert into portal.task_assignees (task_id, staff_id, assigned_at)
select t.id, t.assignee_id, t.created_at
from portal.tasks t
where t.assignee_id is not null
on conflict do nothing;

/*
  `tasks.assignee_id` is kept in step rather than dropped.

  The same treatment `leave_requests.kind` got when `kind_key` superseded it:
  a lot of code reads it, the board orders by it, and changing every reader in
  the same migration as the schema is how a schema change breaks a screen
  nobody was looking at. It now means "one of the people this is assigned to",
  and the trigger keeps it pointing at a real one.
*/
create or replace function portal.tasks_sync_primary_assignee()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  affected uuid := coalesce(new.task_id, old.task_id);
  someone uuid;
begin
  select staff_id into someone
  from portal.task_assignees
  where task_id = affected
  order by assigned_at
  limit 1;

  update portal.tasks set assignee_id = someone where id = affected;

  return null;
end;
$fn$;

create trigger task_assignees_sync
  after insert or delete on portal.task_assignees
  for each row execute function portal.tasks_sync_primary_assignee();

alter table portal.task_assignees enable row level security;

/*
  Visible with the task. `tasks` already decides who may see what — an internal
  task does not exist for a client — so looking it up through that table means
  this cannot say anything different, however that rule changes later.
*/
create policy task_assignees_read on portal.task_assignees
  for select using (task_id in (select id from portal.tasks));

/*
  Assigning is for staff on the project, or an admin.

  Not "anybody who can see the task": a client can see a client-visible task
  and must not be able to hand it to somebody.
*/
create policy task_assignees_write on portal.task_assignees
  for all
  using (
    portal.is_admin()
    or task_id in (
      select t.id from portal.tasks t where portal.is_on_project(t.project_id)
    )
  )
  with check (
    portal.is_admin()
    or task_id in (
      select t.id from portal.tasks t where portal.is_on_project(t.project_id)
    )
  );

grant select, insert, delete on portal.task_assignees to authenticated;

-- ---------------------------------------------------------------------------
-- The state between "in review" and "done".
--
-- Work that came back wrong is not blocked — nothing is stopping it — and it is
-- not in review, because it has been reviewed. Without a column for it, it went
-- back to "in progress" and the fact that it had already failed once was lost.
-- ---------------------------------------------------------------------------

alter type portal.task_status add value if not exists 'needs_changes' before 'done';

-- ---------------------------------------------------------------------------
-- How a task got where it is.
-- ---------------------------------------------------------------------------

create table portal.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references portal.tasks (id) on delete cascade,

  from_status portal.task_status,
  to_status portal.task_status not null,

  /* Who moved it, and what they were called at the time. */
  moved_by uuid references portal.staff (id) on delete set null,
  moved_by_name text not null,

  /*
    Who is picking it up.
    Null when they kept it themselves, which is a real answer rather than a
    missing one — the reason says which.
  */
  handed_to uuid references portal.staff (id) on delete set null,
  handed_to_name text,

  /*
    Why. Required on every move that asks for one.

    The owner's rule: "reason sab me pujhna h". A status change with no reason
    is the thing that makes a board impossible to read a week later — "why is
    this blocked" answered by nothing.
  */
  reason text,

  created_at timestamptz not null default now()
);

comment on table portal.task_events is
  'Every move of a card, with who moved it, who is picking it up and why. The board''s memory: without it, "why is this blocked" has no answer a week later.';

create index task_events_task_idx on portal.task_events (task_id, created_at desc);

alter table portal.task_events enable row level security;

create policy task_events_read on portal.task_events
  for select using (task_id in (select id from portal.tasks));

create policy task_events_write on portal.task_events
  for insert
  with check (
    task_id in (
      select t.id from portal.tasks t
      where portal.is_admin() or portal.is_on_project(t.project_id)
    )
  );

/* No update, no delete. A record of what happened that can be edited
   afterwards is not a record of what happened. */

grant select, insert on portal.task_events to authenticated;
