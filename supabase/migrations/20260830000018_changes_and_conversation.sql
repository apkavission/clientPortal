-- ===========================================================================
-- How many changes a client gets, and the conversation before one becomes work.
--
-- The owner’s instruction, 2026-08-30:
--
--   > portal me client ke project me ek field dena ki kitni baar change ho sakta
--   > hai. Admin panel se koi bhi — admin, manager — 3 daal de. Tracker me client
--   > jo task dega wo tab dega jab documentation ka kaam ho chuka ho: wo developer
--   > ke paas hoga, kaam ho jayega tab wo project done karega. Ho sakta hai is
--   > project pe 4 log kaam kar rahe hon — to chaaron ko complete karna padega.
--   > Uske baad client ka change wala on hoga. Usse pehle jo wo request daalega wo
--   > chat jaisa banega, aur wo bas admin panel me dikhega — developer ke paas tab
--   > tak nahi jayega jab tak approve nahi hota.
--
-- ---------------------------------------------------------------------------
-- Four things, and each one exists because of a specific way projects go wrong.
--
-- **A change allowance, agreed up front.** "Three rounds of changes" is in every
-- quote this company sends and was nowhere in this system, so the argument
-- happened later, from memory, with nothing to point at. Now it is a number on
-- the project and a count of the ones used.
--
-- **Delivery is what turns the allowance on.** A change is a change *to
-- something that was built*. Before that, everything the client says is part of
-- agreeing what to build — and charging those against an allowance would be
-- charging somebody for describing what they wanted.
--
-- **Delivery means everybody’s part.** Four developers on a project means four
-- people saying they are done, not one. One person’s "finished" is one person’s
-- opinion about their own work, and a project marked delivered on it is a
-- project a client is invited to inspect before it exists.
--
-- **Nothing reaches a developer until it is approved.** A client’s message is a
-- conversation with whoever runs the project. It becomes work when somebody
-- decides it is work — and until then it is not on anybody’s board, because a
-- board full of maybes is a board nobody trusts.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The allowance, and what was agreed about it.
-- ---------------------------------------------------------------------------

alter table portal.client_projects
  add column if not exists change_limit   integer not null default 0,
  add column if not exists change_terms   text,
  add column if not exists scope_delivered_at timestamptz;

comment on column portal.client_projects.change_limit is
  'How many rounds of changes are included after delivery. Zero means none were agreed — which is a real answer and is shown as one, not as "unlimited".';
comment on column portal.client_projects.change_terms is
  'What counts as one change, in the words the client agreed to. The sentence somebody reads out when there is an argument.';
comment on column portal.client_projects.scope_delivered_at is
  'When every person on the project had marked their part done. Set by a trigger; never typed in.';

alter table portal.client_projects drop constraint if exists project_change_limit_is_sane;
alter table portal.client_projects
  add constraint project_change_limit_is_sane
  check (change_limit between 0 and 99);

-- ---------------------------------------------------------------------------
-- 2. Each person’s part of the work.
--
-- On the membership row rather than on the project, because that is exactly what
-- is being recorded: this person, on this project, says their part is done. Four
-- people means four rows and four decisions.
-- ---------------------------------------------------------------------------

alter table portal.project_members
  add column if not exists completed_at    timestamptz,
  add column if not exists completion_note text;

comment on column portal.project_members.completed_at is
  'When this person said their part of the documented work was done. The project is delivered when nobody on it is still unfinished.';

-- ---------------------------------------------------------------------------
-- 3. Delivered when everybody is.
--
-- A trigger rather than a column somebody sets, because the moment is a fact
-- about four other rows. Anybody able to type a date into it would be able to
-- open the client’s change allowance early, and the first time that happens it
-- will be by accident.
--
-- **Adding somebody to a delivered project un-delivers it**, which is deliberate:
-- if there is more work to do, it was not finished. The change allowance closes
-- again with it, and that is the honest reading — a client asking for changes to
-- something still being built is asking about the build.
-- ---------------------------------------------------------------------------

create or replace function portal.project_is_delivered_when_everybody_is()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $$
declare
  target     uuid := coalesce(new.project_id, old.project_id);
  total      integer;
  unfinished integer;
begin
  select count(*), count(*) filter (where completed_at is null)
  into total, unfinished
  from portal.project_members
  where project_id = target;

  if total > 0 and unfinished = 0 then
    update portal.client_projects
    set scope_delivered_at = coalesce(scope_delivered_at, now())
    where id = target;
  else
    update portal.client_projects
    set scope_delivered_at = null
    where id = target and scope_delivered_at is not null;
  end if;

  return null;
end;
$$;

drop trigger if exists project_members_delivery on portal.project_members;
create trigger project_members_delivery
  after insert or update or delete on portal.project_members
  for each row execute function portal.project_is_delivered_when_everybody_is();

/** True when every person on the project has marked their part done. */
create or replace function portal.scope_is_complete(p_project_id uuid)
returns boolean
language sql
stable
as $$
  select exists (select 1 from portal.project_members where project_id = p_project_id)
     and not exists (
       select 1 from portal.project_members
       where project_id = p_project_id and completed_at is null
     );
$$;

grant execute on function portal.scope_is_complete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. A request is approved, or it is only a conversation.
--
-- `status` already carries accepted / declined / converted. What was missing is
-- **when** and **by whom** — and the count of changes has to be able to point at
-- a moment somebody agreed to, not at a status that could have been set twice.
-- ---------------------------------------------------------------------------

alter table portal.client_requests
  add column if not exists approved_at   timestamptz,
  add column if not exists approved_by   uuid references portal.staff(id) on delete set null,
  add column if not exists change_number integer;

comment on column portal.client_requests.approved_at is
  'When somebody decided this becomes work. Until it is set, no developer sees this request at all.';
comment on column portal.client_requests.change_number is
  'Which of the agreed change rounds this was, or null if it was not counted as one. Fixed at approval — recounting later would change what the client was told.';

alter table portal.client_requests drop constraint if exists requests_approval_is_complete;
alter table portal.client_requests
  add constraint requests_approval_is_complete
  check ((approved_at is null) = (approved_by is null));

/*
  Work cannot exist before the decision that made it work.

  Without this the "approve first" rule lives only in the application, and the
  one thing this whole feature is for — a developer never seeing a request that
  has not been agreed — would depend on nobody ever writing a converted task by
  another route.
*/
create or replace function portal.conversion_needs_approval()
returns trigger
language plpgsql
as $$
begin
  if new.converted_task_id is not null and new.approved_at is null then
    raise exception 'A request has to be approved before it becomes a task.';
  end if;

  return new;
end;
$$;

drop trigger if exists client_requests_conversion_needs_approval on portal.client_requests;
create trigger client_requests_conversion_needs_approval
  before insert or update on portal.client_requests
  for each row execute function portal.conversion_needs_approval();

/** How many of the agreed change rounds have been used on a project. */
create or replace function portal.changes_used(p_project_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from portal.client_requests
  where project_id = p_project_id
    and change_number is not null;
$$;

grant execute on function portal.changes_used(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The conversation.
--
-- A request stopped being a form and became a thread, because that is what it
-- always was in practice: the client says something, somebody asks what they
-- mean, they answer, and only then is there enough to decide. All of that used
-- to happen on the phone, and the decision arrived on the board with no trace of
-- why.
--
-- `is_internal` is the same idea as on task comments: staff talking among
-- themselves inside the thread, invisible to the client, enforced by the policy
-- rather than by a condition in a screen.
-- ---------------------------------------------------------------------------

create table if not exists portal.request_messages (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references portal.client_requests(id) on delete cascade,

  /* Exactly one of these. A message is from a person, and which kind of person
     decides who can see it and how it is drawn. */
  staff_id       uuid references portal.staff(id) on delete set null,
  client_user_id uuid references portal.client_users(id) on delete set null,

  /* Kept so a message survives the person leaving. A thread that reads
     "Someone: we agreed to this" a year later is worthless. */
  author_name  text not null,

  body         text not null check (length(btrim(body)) > 0),
  is_internal  boolean not null default false,

  created_at   timestamptz not null default now(),

  constraint message_has_one_author check (
    (staff_id is not null)::int + (client_user_id is not null)::int = 1
  ),

  -- A client cannot write an internal note. It would be invisible to them the
  -- moment they saved it, which is the most confusing thing this table could do.
  constraint client_messages_are_never_internal check (
    client_user_id is null or is_internal = false
  )
);

comment on table portal.request_messages is
  'The conversation on one client request. Internal messages are staff-only and the policy enforces it — there is no condition in any screen.';

create index if not exists request_messages_thread_idx
  on portal.request_messages (request_id, created_at);

-- ---------------------------------------------------------------------------
-- 6. Who sees a request, and when.
--
-- This is the rule the owner asked for, and it replaces `requests_staff_all`:
--
--   **An admin** sees every request from the moment it arrives. It is their
--   conversation to have.
--   **A developer** sees one only once it has been approved. Before that it is
--   not work and it is not theirs to answer.
--   **A client** sees their own project’s requests, as before.
--
-- Written as a select policy rather than a filter in the tracker, because a
-- filter in one screen is a filter that the next screen forgets.
-- ---------------------------------------------------------------------------

drop policy if exists requests_staff_all on portal.client_requests;

drop policy if exists requests_admin_all on portal.client_requests;
create policy requests_admin_all on portal.client_requests
  for all using (portal.is_admin()) with check (portal.is_admin());

drop policy if exists requests_developer_read_approved on portal.client_requests;
create policy requests_developer_read_approved on portal.client_requests
  for select using (portal.is_staff() and approved_at is not null);

-- ---------------------------------------------------------------------------
-- 7. Who sees the conversation.
--
-- The thread follows the request: if you cannot see the request you cannot see
-- what was said on it. Expressed as an `exists` against the requests table so
-- the two answers can never disagree — including the developer’s "only after
-- approval", which is inherited rather than repeated.
-- ---------------------------------------------------------------------------

alter table portal.request_messages enable row level security;

grant select, insert on portal.request_messages to authenticated;
grant all on portal.request_messages to service_role;

drop policy if exists request_messages_read on portal.request_messages;
create policy request_messages_read on portal.request_messages
  for select using (
    exists (select 1 from portal.client_requests r where r.id = request_id)
    and (is_internal = false or portal.is_staff())
  );

drop policy if exists request_messages_staff_write on portal.request_messages;
create policy request_messages_staff_write on portal.request_messages
  for insert with check (
    portal.is_staff()
    and staff_id in (select id from portal.staff where auth_user_id = auth.uid())
  );

drop policy if exists request_messages_client_write on portal.request_messages;
create policy request_messages_client_write on portal.request_messages
  for insert with check (
    is_internal = false
    and client_user_id in (
      select id from portal.client_users where auth_user_id = auth.uid()
    )
    and exists (
      select 1 from portal.client_requests r
      where r.id = request_id and portal.client_can_see_project(r.project_id)
    )
  );
