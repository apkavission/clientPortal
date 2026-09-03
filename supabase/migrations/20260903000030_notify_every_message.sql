-- ===========================================================================
-- Every message tells somebody. Not only chat.
--
-- ---------------------------------------------------------------------------
-- **What this fixes.**
--
-- Chat notified people. The other three places anybody writes did not:
--
--   * `project_messages`  — talking about the project
--   * `request_messages`  — the conversation on a client's request
--   * `task_comments`     — a note on a task
--
-- All three are messages in every sense that matters to the person waiting for
-- a reply. A client asking a question on their project and hearing nothing is
-- the same failure as a chat message that never arrives, and it is worse here
-- because these are the threads clients actually use.
--
-- ---------------------------------------------------------------------------
-- **The rule that must not be got wrong: `is_internal`.**
--
-- All three tables carry it, and it means "only the team sees this". A
-- notification is a copy of the first line of a message delivered to somebody's
-- screen — so notifying a client about an internal note leaks it in the most
-- direct way possible, past every policy protecting the message itself.
--
-- So every client recipient here is gated on `not is_internal`, and there is a
-- test that writes an internal note and asserts the client was not told.
--
-- ---------------------------------------------------------------------------
-- **Why triggers again rather than application code.**
--
-- The same reason as chat, learned the same way: the application's own attempt
-- was refused by the recipient-is-you policy on `notifications`, silently, and
-- the feature looked finished for as long as nobody checked whether anybody had
-- actually been told. Writing a row for somebody else needs the definer's
-- rights, and doing it in a trigger means no future write path can forget.
-- ===========================================================================

/**
 * A message trimmed to a line.
 *
 * Shared so every kind of notification reads the same length in the list. A
 * notification is a nudge towards the conversation, not a copy of it.
 */
create or replace function portal.preview(p_body text)
returns text
language sql
immutable
as $fn$
  select case
    when p_body is null then null
    when length(p_body) > 120 then left(p_body, 117) || '…'
    else p_body
  end;
$fn$;

comment on function portal.preview(text) is
  'The first line or so of a message, for a notification list.';

/**
 * Everybody who should hear about something on a project.
 *
 * The team on it, plus every admin — because a project with nobody assigned
 * still has to reach somebody, and a client writing into silence is the failure
 * this whole feature exists to prevent. `distinct` because an admin who is also
 * on the project is one person, not two.
 */
create or replace function portal.project_staff(p_project_id uuid)
returns table (staff_id uuid)
language sql
stable
security definer
set search_path = portal, public
as $fn$
  select distinct s.id
  from portal.staff s
  where s.is_active
    and (
      s.role_key = 'admin'
      or exists (
        select 1 from portal.project_members m
        where m.project_id = p_project_id
          and m.staff_id = s.id
          and m.completed_at is null
      )
      or exists (
        select 1 from portal.client_projects p
        where p.id = p_project_id and p.lead_developer_id = s.id
      )
    );
$fn$;

/**
 * The people on the client's side of a project.
 *
 * Only ever called where `is_internal` is already false — see the note at the
 * top. It is a separate function rather than a join so that gate is visible at
 * every call site instead of buried in a where clause.
 */
create or replace function portal.project_client_users(p_project_id uuid)
returns table (client_user_id uuid)
language sql
stable
security definer
set search_path = portal, public
as $fn$
  select cu.id
  from portal.client_users cu
  join portal.client_projects p on p.client_id = cu.client_id
  where p.id = p_project_id
    and cu.is_active;
$fn$;

-- ---------------------------------------------------------------------------
-- Talking about the project.
-- ---------------------------------------------------------------------------

create or replace function portal.notify_project_message()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  slug text;
begin
  select p.slug into slug
  from portal.client_projects p
  where p.id = new.project_id;

  insert into portal.notifications (staff_id, client_user_id, kind, title, body, link)
  select
    r.staff_id,
    r.client_user_id,
    'project.message',
    new.author_name || ' wrote on the project',
    portal.preview(new.body),
    '/p/' || slug
  from (
    select s.staff_id, null::uuid as client_user_id
    from portal.project_staff(new.project_id) s

    union all

    /* The client side, and only when this is not an internal note. An
       internal note copied into a client's notification list is the leak
       this whole file is careful about. */
    select null::uuid, c.client_user_id
    from portal.project_client_users(new.project_id) c
    where not new.is_internal
  ) r
  where (r.staff_id is null or r.staff_id is distinct from new.staff_id)
    and (r.client_user_id is null or r.client_user_id is distinct from new.client_user_id);

  return new;
end;
$fn$;

drop trigger if exists project_messages_notify on portal.project_messages;
create trigger project_messages_notify
  after insert on portal.project_messages
  for each row execute function portal.notify_project_message();

-- ---------------------------------------------------------------------------
-- The conversation on a request.
--
-- Both sides open the same address — `/request/{id}` — so unlike the others
-- there is no per-audience link to work out here.
-- ---------------------------------------------------------------------------

create or replace function portal.notify_request_message()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  project uuid;
  raised_by uuid;
  request_title text;
begin
  select r.project_id, r.client_user_id, r.title
    into project, raised_by, request_title
  from portal.client_requests r
  where r.id = new.request_id;

  insert into portal.notifications (staff_id, client_user_id, kind, title, body, link)
  select distinct
    r.staff_id,
    r.client_user_id,
    'request.message',
    new.author_name || ' wrote about “' || request_title || '”',
    portal.preview(new.body),
    '/request/' || new.request_id
  from (
    select s.staff_id, null::uuid as client_user_id
    from portal.project_staff(project) s

    union

    /*
      Whoever raised it, first and foremost — they are the person waiting for
      an answer. Still gated on the internal flag: the team discussing a
      request among themselves is not an answer to the person who asked.
    */
    select null::uuid, raised_by
    where raised_by is not null and not new.is_internal
  ) r
  where (r.staff_id is null or r.staff_id is distinct from new.staff_id)
    and (r.client_user_id is null or r.client_user_id is distinct from new.client_user_id);

  return new;
end;
$fn$;

drop trigger if exists request_messages_notify on portal.request_messages;
create trigger request_messages_notify
  after insert on portal.request_messages
  for each row execute function portal.notify_request_message();

-- ---------------------------------------------------------------------------
-- A note on a task.
--
-- Two gates on the client side rather than one: the comment must not be
-- internal, *and* the task itself must be one the client can see. A comment on
-- an internal task is not internal by itself, and without the second gate the
-- notification would announce the existence of work the client was never meant
-- to know about — the task's title is right there in the heading.
-- ---------------------------------------------------------------------------

create or replace function portal.notify_task_comment()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  project uuid;
  task_title text;
  assignee uuid;
  client_may_see boolean;
  author_name text;
begin
  select t.project_id, t.title, t.assignee_id, t.is_client_visible
    into project, task_title, assignee, client_may_see
  from portal.tasks t
  where t.id = new.task_id;

  /* The author's name, which this table does not store. Looked up rather than
     denormalised because changing the table's shape is not this migration's
     job; the message itself still carries the author reference. */
  select coalesce(s.full_name, cu.full_name, 'Somebody')
    into author_name
  from (select 1) x
  left join portal.staff s on s.id = new.author_staff_id
  left join portal.client_users cu on cu.id = new.author_client_id;

  insert into portal.notifications (staff_id, client_user_id, kind, title, body, link)
  select distinct
    r.staff_id,
    r.client_user_id,
    'task.comment',
    author_name || ' commented on “' || task_title || '”',
    portal.preview(new.body),
    '/task/' || new.task_id
  from (
    select s.staff_id, null::uuid as client_user_id
    from portal.project_staff(project) s

    union

    -- The person the task belongs to, even if they are somehow not on the
    -- project any more. They are the one being asked.
    select assignee, null::uuid
    where assignee is not null

    union

    select null::uuid, c.client_user_id
    from portal.project_client_users(project) c
    where not new.is_internal and coalesce(client_may_see, false)
  ) r
  where (r.staff_id is null or r.staff_id is distinct from new.author_staff_id)
    and (r.client_user_id is null or r.client_user_id is distinct from new.author_client_id);

  return new;
end;
$fn$;

drop trigger if exists task_comments_notify on portal.task_comments;
create trigger task_comments_notify
  after insert on portal.task_comments
  for each row execute function portal.notify_task_comment();

comment on function portal.notify_project_message() is
  'Tells the project team, and the client unless the note is internal.';
comment on function portal.notify_request_message() is
  'Tells the project team and whoever raised the request, unless the note is internal.';
comment on function portal.notify_task_comment() is
  'Tells the project team and the assignee; the client only when the comment is not internal AND the task is one they can see.';
