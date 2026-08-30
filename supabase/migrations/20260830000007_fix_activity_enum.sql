-- ===========================================================================
-- The activity trigger could not write a row, so no task could be created.
--
-- **What went wrong.** In `20260829000004_portal_progress.sql`,
-- `log_task_activity()` chooses the actor type like this:
--
--     case when actor is null then ’system’ else ’team’ end
--
-- Inside plpgsql that expression is `text`, and Postgres will not implicitly
-- cast text into an enum in an INSERT target list. Every attempt came back:
--
--     42804 — column "actor_type" is of type actor_type but expression is of
--             type text
--
-- **Why that was worse than it looks.** The trigger fires `after insert` on
-- `portal.tasks`, so the failure was not confined to the feed — it rolled back
-- the task itself. **No task could be created at all**, by anyone, through any
-- route. The tracker was inert and the schema looked perfectly healthy.
--
-- It was found by seeding test data and noticing the table stayed empty. Not by
-- reading the SQL, which had been read several times.
--
-- The fix is the cast that should have been there. Written out as a variable
-- first rather than cast inline, so the type is stated once and the insert reads
-- as a list of values rather than a list of expressions.
-- ===========================================================================

create or replace function portal.log_task_activity()
returns trigger
language plpgsql
as $$
declare
  actor       uuid;
  who         portal.actor_type;
  what        text;
  description text;
begin
  -- Only meaningful transitions. A feed that logs every keystroke is one
  -- nobody reads, which is the same as not having one.
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return null;
  end if;

  select id into actor from portal.staff where auth_user_id = auth.uid();

  -- The cast this function was missing. `actor` is null when the row was
  -- written by a script or a trigger rather than by a signed-in person, and
  -- "system" is the honest word for that.
  who := (case when actor is null then 'system' else 'team' end)::portal.actor_type;

  what := case when tg_op = 'INSERT' then 'created' else 'status_changed' end;

  description := case
    when tg_op = 'INSERT' then new.title || ' was added'
    when new.status = 'done' then new.title || ' was completed'
    else new.title || ' moved to ' || replace(new.status::text, '_', ' ')
  end;

  insert into portal.activity_log
    (project_id, actor_type, actor_staff_id, action, entity, entity_id, summary, is_client_visible)
  values (
    new.project_id,
    who,
    actor,
    what,
    'task',
    new.id,
    description,
    new.is_client_visible
  );

  return null;
end;
$$;

-- The trigger itself is unchanged; only the function it calls was wrong.
drop trigger if exists tasks_log_activity on portal.tasks;
create trigger tasks_log_activity
  after insert or update of status on portal.tasks
  for each row execute function portal.log_task_activity();
