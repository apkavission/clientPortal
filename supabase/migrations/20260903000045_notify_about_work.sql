-- ===========================================================================
-- Being told about work: a card moved to you, a task given to you, a project
-- you have been put on.
--
-- ---------------------------------------------------------------------------
-- **The owner's point, and it is the right one.**
--
--   > jaha jaha pe modal open hoga and wo form fill karega to wo chej jo h
--   > notification me jana chiaye … warna jo h agar employe ko kaise pata
--   > lagega
--
-- Everything built so far records these perfectly and tells nobody. Somebody
-- hands a card to a colleague with a reason, and the colleague finds out by
-- opening the board and noticing. A task assigned on a Friday is discovered on
-- Monday. That is the whole gap.
--
-- ---------------------------------------------------------------------------
-- **Triggers, for the reason the chat ones are triggers.**
--
-- The application tried to write notifications itself once and every insert was
-- silently refused: the policy on `notifications` allows a row only when the
-- recipient is the caller, which is right — otherwise anybody could post into
-- anybody's bell — and which makes notifying somebody *else* impossible from
-- the application. It needs the definer's rights, and a trigger means no future
-- write path can forget.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A card moved, and somebody was asked to pick it up.
-- ---------------------------------------------------------------------------

create or replace function portal.notify_task_event()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  task_title text;
  moved_to text;
begin
  select t.title into task_title from portal.tasks t where t.id = new.task_id;

  /* The kind's own label, not a word invented here. "needs_changes" in a
     notification is a column name leaking into a sentence. */
  moved_to := replace(new.to_status::text, '_', ' ');

  insert into portal.notifications (staff_id, kind, title, body, link)
  select distinct
    person.staff_id,
    'task.moved',
    case
      when new.handed_to = person.staff_id
        then new.moved_by_name || ' asked you to pick up “' || task_title || '”'
      else new.moved_by_name || ' moved “' || task_title || '” to ' || moved_to
    end,
    /* The reason, which is the whole point of asking for one. A move that
       says "moved to blocked" and nothing else is what the reason field was
       added to stop. */
    coalesce(new.reason, 'No reason given.'),
    '/task/' || new.task_id
  from (
    /* Whoever was handed it, and everybody already on it — they are the
       people whose work just changed shape. */
    select new.handed_to as staff_id where new.handed_to is not null
    union
    select a.staff_id from portal.task_assignees a where a.task_id = new.task_id
  ) person
  where person.staff_id is not null
    /* Not the person who did it. Being told what you just typed is the fastest
       way to teach somebody that the bell is noise. */
    and person.staff_id is distinct from new.moved_by;

  return new;
end;
$fn$;

comment on function portal.notify_task_event() is
  'Tells whoever was handed a card, and everybody already on it, that it moved — with the reason. Without this the reason is recorded and nobody reads it.';

drop trigger if exists task_events_notify on portal.task_events;
create trigger task_events_notify
  after insert on portal.task_events
  for each row execute function portal.notify_task_event();

-- ---------------------------------------------------------------------------
-- A task given to somebody.
-- ---------------------------------------------------------------------------

create or replace function portal.notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  task_title text;
  project_name text;
begin
  select t.title, p.name
    into task_title, project_name
  from portal.tasks t
  left join portal.client_projects p on p.id = t.project_id
  where t.id = new.task_id;

  /*
    Nothing to say when somebody took it themselves.

    Assigning your own task is the commonest case — it is the default in the
    add-task dialog — and a notification about it is a message from yourself.
  */
  if new.assigned_by is null or new.assigned_by = new.staff_id then
    return new;
  end if;

  insert into portal.notifications (staff_id, kind, title, body, link)
  values (
    new.staff_id,
    'task.assigned',
    coalesce(new.assigned_by_name, 'Somebody') || ' gave you a task',
    task_title || coalesce(' · ' || project_name, ''),
    '/task/' || new.task_id
  );

  return new;
end;
$fn$;

comment on function portal.notify_task_assigned() is
  'Tells somebody a task is now theirs. Silent when they assigned it to themselves, which is the default and the commonest case.';

drop trigger if exists task_assignees_notify on portal.task_assignees;
create trigger task_assignees_notify
  after insert on portal.task_assignees
  for each row execute function portal.notify_task_assigned();

-- ---------------------------------------------------------------------------
-- Being put on a project.
-- ---------------------------------------------------------------------------

create or replace function portal.notify_project_member()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  project_name text;
  project_slug text;
  me uuid := portal.current_staff_id();
begin
  select p.name, p.slug
    into project_name, project_slug
  from portal.client_projects p
  where p.id = new.project_id;

  /* Adding yourself needs no announcement. */
  if me is not null and me = new.staff_id then
    return new;
  end if;

  insert into portal.notifications (staff_id, kind, title, body, link)
  values (
    new.staff_id,
    'project.added',
    'You are on “' || project_name || '”',
    /* What they can do now, rather than what happened. "You were added to a
       project" leaves somebody wondering whether anything is expected. */
    'You can move its work and add to it. Anything assigned to you will show under Your work here.',
    '/p/' || project_slug
  );

  return new;
end;
$fn$;

comment on function portal.notify_project_member() is
  'Tells somebody they are on a project, and what that means for them. Silent when they added themselves.';

drop trigger if exists project_members_notify on portal.project_members;
create trigger project_members_notify
  after insert on portal.project_members
  for each row execute function portal.notify_project_member();
