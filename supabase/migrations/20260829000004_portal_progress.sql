-- ===========================================================================
-- Progress and health, computed and never typed.
--
-- The rule this whole file exists for: **a percentage entered by hand drifts
-- from reality, and the first time a client notices, every other number on the
-- page stops being believed.** So nobody types one. A developer ticks a task
-- and the client’s figure moves, because the figure is derived from the tasks.
--
-- Two shapes of the same idea:
--
--   phase.progress   = done client-visible estimate hours
--                    / all client-visible estimate hours
--                      (falls back to counting tasks where estimates are absent)
--
--   project.progress = phase progress, averaged and weighted by phase.weight
--
-- Only client-visible tasks count. Refactoring a build script is real work and
-- it is not work the client asked for; letting it move their number would make
-- the number mean something nobody agreed to.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- One phase.
--
-- Estimates first, task count second. Mixing them within a phase would be
-- worse than either: a phase where three of ten tasks carry estimates would
-- weigh those three as if they were the whole job.
--
-- A phase with no client-visible tasks is 0%, not 100%. "Nothing to do" and
-- "everything done" look the same to a division and mean opposite things to a
-- person reading a progress bar.
-- ---------------------------------------------------------------------------

create or replace function portal.phase_progress(p_phase_id uuid)
returns integer
language plpgsql
stable
as $$
declare
  total_estimate  numeric;
  done_estimate   numeric;
  total_count     integer;
  done_count      integer;
begin
  select
    coalesce(sum(estimate_hours), 0),
    coalesce(sum(estimate_hours) filter (where status = 'done'), 0),
    count(*),
    count(*) filter (where status = 'done')
  into total_estimate, done_estimate, total_count, done_count
  from portal.tasks
  where phase_id = p_phase_id
    and is_client_visible
    and status <> 'cancelled';

  if total_count = 0 then
    return 0;
  end if;

  if total_estimate > 0 then
    return round(done_estimate * 100 / total_estimate);
  end if;

  return round(done_count::numeric * 100 / total_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- One project.
--
-- The weighted average of its phases. A project with no phases falls back to
-- treating the whole project as one bucket of tasks, so a small job that nobody
-- bothered to divide up still reports something true.
-- ---------------------------------------------------------------------------

create or replace function portal.project_progress(p_project_id uuid)
returns integer
language plpgsql
stable
as $$
declare
  weighted      numeric := 0;
  total_weight  numeric := 0;
  phase_count   integer;
  total_count   integer;
  done_count    integer;
begin
  select count(*) into phase_count
  from portal.project_phases where project_id = p_project_id;

  if phase_count > 0 then
    select
      coalesce(sum(portal.phase_progress(id) * weight), 0),
      coalesce(sum(weight), 0)
    into weighted, total_weight
    from portal.project_phases
    where project_id = p_project_id;

    if total_weight = 0 then
      return 0;
    end if;

    return round(weighted / total_weight);
  end if;

  -- No phases: count the project’s tasks directly.
  select count(*), count(*) filter (where status = 'done')
  into total_count, done_count
  from portal.tasks
  where project_id = p_project_id
    and is_client_visible
    and status <> 'cancelled';

  if total_count = 0 then
    return 0;
  end if;

  return round(done_count::numeric * 100 / total_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- Health.
--
-- `delayed`  — past its target date and not finished. Not a judgement, a fact.
-- `at_risk`  — more than 80% of the time has gone and less than 60% of the work
--              is done. The pair of numbers is what makes it an early warning
--              rather than a second way of saying "late".
--
-- With no dates there is nothing to be late against, so it stays `on_track`.
-- ---------------------------------------------------------------------------

create or replace function portal.project_health(p_project_id uuid)
returns portal.health
language plpgsql
stable
as $$
declare
  proj          record;
  progress      integer;
  elapsed_share numeric;
begin
  select start_date, target_date, stage, actual_end_date
  into proj
  from portal.client_projects
  where id = p_project_id;

  if not found or proj.stage in ('closed','support') or proj.actual_end_date is not null then
    return 'on_track';
  end if;

  progress := portal.project_progress(p_project_id);

  if proj.target_date is not null
     and current_date > proj.target_date
     and progress < 100 then
    return 'delayed';
  end if;

  if proj.start_date is not null
     and proj.target_date is not null
     and proj.target_date > proj.start_date then

    elapsed_share := (current_date - proj.start_date)::numeric
                     / (proj.target_date - proj.start_date)::numeric;

    if elapsed_share > 0.8 and progress < 60 then
      return 'at_risk';
    end if;
  end if;

  return 'on_track';
end;
$$;

-- ---------------------------------------------------------------------------
-- Keeping the stored copies in step.
--
-- The percentages live in columns as well as in these functions. That is a
-- cache, and it is here for one reason: a list of twenty projects should be one
-- query, not twenty function calls. The trigger is what stops a cache from
-- becoming a lie.
--
-- Recomputed whenever a task’s status, estimate, phase or visibility changes —
-- those four are exactly the inputs above, and nothing else needs to fire it.
-- ---------------------------------------------------------------------------

create or replace function portal.recompute_progress(p_project_id uuid)
returns void
language plpgsql
as $$
begin
  update portal.project_phases
  set progress_percent = portal.phase_progress(id)
  where project_id = p_project_id;

  update portal.client_projects
  set progress_percent = portal.project_progress(p_project_id),
      health           = portal.project_health(p_project_id)
  where id = p_project_id;
end;
$$;

create or replace function portal.tasks_touch_progress()
returns trigger
language plpgsql
as $$
begin
  perform portal.recompute_progress(coalesce(new.project_id, old.project_id));

  -- A task moved between projects has to settle both sides.
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    perform portal.recompute_progress(old.project_id);
  end if;

  return null;
end;
$$;

drop trigger if exists tasks_recompute_progress on portal.tasks;
create trigger tasks_recompute_progress
  after insert or delete or update of status, estimate_hours, phase_id, is_client_visible, project_id
  on portal.tasks
  for each row execute function portal.tasks_touch_progress();

/*
  A phase's weight or its arrival changes the project's number too, without any
  task having moved.
*/
create or replace function portal.phases_touch_progress()
returns trigger
language plpgsql
as $$
begin
  perform portal.recompute_progress(coalesce(new.project_id, old.project_id));
  return null;
end;
$$;

drop trigger if exists phases_recompute_progress on portal.project_phases;
create trigger phases_recompute_progress
  after insert or delete or update of weight, project_id
  on portal.project_phases
  for each row execute function portal.phases_touch_progress();

-- ---------------------------------------------------------------------------
-- The activity feed, written by the database.
--
-- Triggered rather than called from the application, so the feed cannot fall
-- out of step with what actually happened. A feed that depends on somebody
-- remembering to log is wrong the first time somebody forgets, and nobody ever
-- finds out — the entry that is missing is invisible by definition.
--
-- Only meaningful transitions are recorded. A feed that logs every keystroke is
-- one nobody reads, which is the same as not having one.
-- ---------------------------------------------------------------------------

create or replace function portal.log_task_activity()
returns trigger
language plpgsql
as $$
declare
  actor uuid;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return null;
  end if;

  select id into actor from portal.staff where auth_user_id = auth.uid();

  insert into portal.activity_log
    (project_id, actor_type, actor_staff_id, action, entity, entity_id, summary, is_client_visible)
  values (
    new.project_id,
    case when actor is null then 'system' else 'team' end,
    actor,
    case when tg_op = 'INSERT' then 'created' else 'status_changed' end,
    'task',
    new.id,
    case
      when tg_op = 'INSERT' then new.title || ' was added'
      when new.status = 'done' then new.title || ' was completed'
      else new.title || ' moved to ' || replace(new.status::text, '_', ' ')
    end,
    new.is_client_visible
  );

  return null;
end;
$$;

drop trigger if exists tasks_log_activity on portal.tasks;
create trigger tasks_log_activity
  after insert or update of status on portal.tasks
  for each row execute function portal.log_task_activity();
