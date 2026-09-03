-- ===========================================================================
-- Somebody's part of a project is finished when their work is finished.
--
-- ---------------------------------------------------------------------------
-- **The owner's instruction: take the button away.**
--
--   > ye mark as done wala chej h … ye hata do ye automatic hona chiaye … us
--   > employe ko bhi kaam diya tha wo sab done ho gaya h to waha pe us hisab
--   > se uska progress show hoga
--
-- `project_members.completed_at` was set by a person pressing "mark as done".
-- That is a second opinion about a fact the tasks already state, and the two
-- disagree constantly in both directions: somebody finishes their last task and
-- forgets to press it, so the project never counts as delivered; or presses it
-- and is then given another task, and the project claims their part is done
-- while they are still working.
--
-- It is now worked out: your part is done when every task assigned to you on
-- that project is done or cancelled, and there is at least one. Take a new task
-- and it un-marks itself.
--
-- ---------------------------------------------------------------------------
-- **`completion_note` stays and stays typed by hand.** "Done" is a fact about
-- the tasks; "I have handed the API keys to Rahul" is not, and nothing can
-- derive it.
-- ===========================================================================

/**
 * Recompute one person's part of one project.
 *
 * ---------------------------------------------------------------------------
 * **"At least one" is load-bearing.** Without it, a person newly added to a
 * project has zero tasks, zero of which are unfinished — so they would count as
 * finished the moment they joined, and a project with three idle people would
 * report itself delivered.
 */
create or replace function portal.recompute_member_done(
  p_project_id uuid,
  p_staff_id uuid
)
returns void
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  total integer;
  outstanding integer;
begin
  select
    count(*),
    count(*) filter (where t.status not in ('done', 'cancelled'))
  into total, outstanding
  from portal.tasks t
  join portal.task_assignees a on a.task_id = t.id
  where t.project_id = p_project_id
    and a.staff_id = p_staff_id;

  update portal.project_members
  set completed_at = case
    when total > 0 and outstanding = 0 then coalesce(completed_at, now())
    else null
  end
  where project_id = p_project_id
    and staff_id = p_staff_id;
end;
$fn$;

comment on function portal.recompute_member_done(uuid, uuid) is
  'Marks one person''s part of a project done when every task assigned to them there is finished, and un-marks it when they take another. Replaces a button that could disagree with the tasks in both directions.';

/**
 * Anything that could have changed the answer, recomputed.
 *
 * Fires on a task's status changing, on a task moving project, and on somebody
 * being added to or taken off a task. Each of those is a different way for
 * "have they finished here" to become a different answer.
 */
create or replace function portal.tasks_touch_member_done()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  who record;
begin
  for who in
    select distinct a.staff_id, t.project_id
    from portal.task_assignees a
    join portal.tasks t on t.id = a.task_id
    where a.task_id in (coalesce(new.id, old.id))
  loop
    perform portal.recompute_member_done(who.project_id, who.staff_id);
  end loop;

  return null;
end;
$fn$;

create trigger tasks_member_done
  after insert or update of status, project_id on portal.tasks
  for each row execute function portal.tasks_touch_member_done();

create or replace function portal.assignees_touch_member_done()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  project uuid;
begin
  select t.project_id into project
  from portal.tasks t
  where t.id = coalesce(new.task_id, old.task_id);

  if project is not null then
    perform portal.recompute_member_done(project, coalesce(new.staff_id, old.staff_id));
  end if;

  return null;
end;
$fn$;

create trigger task_assignees_member_done
  after insert or delete on portal.task_assignees
  for each row execute function portal.assignees_touch_member_done();

/*
  And every existing row, brought in line.

  Whatever was pressed before now gives way to what the tasks say. Somebody who
  pressed the button and still has open work stops counting as finished, which
  is the point.
*/
do $$
declare
  m record;
begin
  for m in select project_id, staff_id from portal.project_members loop
    perform portal.recompute_member_done(m.project_id, m.staff_id);
  end loop;
end;
$$;
