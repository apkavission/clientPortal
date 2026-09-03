-- ===========================================================================
-- Chat, and the notifications that make it worth having.
--
-- The owner's instruction, 2026-08-31:
--
--   > ab aate hain sabse main cheez pe, chat wala aur notification wala — wo
--   > task tracker pe jana chahiye ... ek employee dusre se baat kar sakta
--   > hai, aur group bana diya usme sab message kar sakte hain ... client us
--   > developer ko message nahi kar sakta, wo bas admin ko karega
--
-- ---------------------------------------------------------------------------
-- **Three kinds of conversation, one table.**
--
--   `direct`  — two people, usually two employees.
--   `group`   — any number, with a name somebody chose.
--   `project` — attached to a project, and the one a client can be in.
--
-- One table rather than three, because a message does not care: it belongs to
-- a conversation and is read by its members. Splitting them would mean three
-- message tables and three sets of policies saying the same thing slightly
-- differently, which is how one of them ends up wrong.
--
-- ---------------------------------------------------------------------------
-- **A client talks to whoever holds the project, never to a developer.**
--
-- That is the owner's rule and it is enforced where it cannot be argued with:
-- `chat_members_client_only_with_admins` refuses to add a client to a
-- conversation that has a plain developer in it, and refuses to add a plain
-- developer to one that has a client. Whoever holds the project — an admin, a
-- manager, a TL, whatever the role is called this month — is decided by
-- `portal.is_admin()`, so renaming roles in the company admin does not quietly
-- open a door here.
--
-- The trigger is deliberately symmetric. Checking only one direction is how
-- this kind of rule gets bypassed: nobody adds the client to the developer's
-- thread, they add the developer to the client's.
--
-- ---------------------------------------------------------------------------
-- **Notifications are rows, not emails.**
--
-- A notification is a thing the tracker shows; sending mail is a separate
-- decision with a separate failure mode, and a chat that stops working because
-- SMTP is down is worse than one with no email at all. `read_at` is null until
-- somebody has actually seen it.
-- ===========================================================================

do $$ begin
  create type portal.conversation_kind as enum ('direct', 'group', 'project');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- The conversations
-- ---------------------------------------------------------------------------

create table if not exists portal.conversations (
  id         uuid primary key default gen_random_uuid(),
  kind       portal.conversation_kind not null default 'direct',

  /* Only for `project` conversations, and required for them: a project thread
     with no project is a group chat wearing the wrong label. */
  project_id uuid references portal.client_projects(id) on delete cascade,

  /* Groups are named by whoever made them. A direct conversation is named by
     who is in it, which the screen works out — a title typed once and never
     updated would go stale the moment somebody joined. */
  title      text check (title is null or length(btrim(title)) > 0),

  created_by uuid references portal.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint conversations_project_has_project
    check ((kind = 'project') = (project_id is not null)),

  constraint conversations_group_has_title
    check (kind <> 'group' or title is not null)
);

comment on table portal.conversations is
  'A thread. Direct between two people, a named group, or attached to a project — the only kind a client can be in.';

create index if not exists conversations_project_idx
  on portal.conversations (project_id) where project_id is not null;

drop trigger if exists conversations_set_updated_at on portal.conversations;
create trigger conversations_set_updated_at
  before update on portal.conversations
  for each row execute function portal.set_updated_at();

-- ---------------------------------------------------------------------------
-- Who is in them
--
-- A member is a staff member or a client user, never both and never neither.
-- Two nullable columns with a check rather than one polymorphic id, so both
-- keep their foreign key — an id that points at "one of two tables" points at
-- nothing the database can enforce.
-- ---------------------------------------------------------------------------

create table if not exists portal.conversation_members (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references portal.conversations(id) on delete cascade,

  staff_id        uuid references portal.staff(id) on delete cascade,
  client_user_id  uuid references portal.client_users(id) on delete cascade,

  /* When they last opened it. What "unread" is measured against, and cheaper
     than a read receipt per message. */
  last_read_at    timestamptz,
  joined_at       timestamptz not null default now(),

  constraint conversation_members_one_person
    check ((staff_id is null) <> (client_user_id is null))
);

comment on table portal.conversation_members is
  'Who can see a conversation. Exactly one of staff_id or client_user_id — an id pointing at one of two tables is an id the database cannot enforce.';

create unique index if not exists conversation_members_staff_once
  on portal.conversation_members (conversation_id, staff_id) where staff_id is not null;

create unique index if not exists conversation_members_client_once
  on portal.conversation_members (conversation_id, client_user_id) where client_user_id is not null;

-- ---------------------------------------------------------------------------
-- The rule the owner asked for, as a trigger.
-- ---------------------------------------------------------------------------

create or replace function portal.chat_client_only_with_admins()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  has_client boolean;
  has_plain_developer boolean;
begin
  select exists (
    select 1 from portal.conversation_members m
    where m.conversation_id = new.conversation_id and m.client_user_id is not null
  ) into has_client;

  select exists (
    select 1
    from portal.conversation_members m
    join portal.staff s on s.id = m.staff_id
    join company.roles r on r.key = s.role_key
    where m.conversation_id = new.conversation_id
      and m.staff_id is not null
      and not r.is_owner
      and r.key <> 'manager'
  ) into has_plain_developer;

  if has_client and has_plain_developer then
    raise exception
      'A client and a developer cannot be in the same conversation. A client talks to whoever holds the project.'
      using errcode = '23514';
  end if;

  return new;
end;
$fn$;

drop trigger if exists conversation_members_client_rule on portal.conversation_members;
create constraint trigger conversation_members_client_rule
  after insert or update on portal.conversation_members
  deferrable initially deferred
  for each row execute function portal.chat_client_only_with_admins();

-- ---------------------------------------------------------------------------
-- The messages
-- ---------------------------------------------------------------------------

create table if not exists portal.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references portal.conversations(id) on delete cascade,

  author_staff_id       uuid references portal.staff(id) on delete set null,
  author_client_user_id uuid references portal.client_users(id) on delete set null,

  /* Written down at the time, so a reply still says who wrote it after they
     have left and their row has gone. The owner asked for the name on every
     reply; a join that returns null once somebody leaves does not deliver it. */
  author_name     text not null check (length(btrim(author_name)) > 0),

  body            text not null check (length(btrim(body)) > 0),
  created_at      timestamptz not null default now(),

  constraint chat_messages_one_author
    check ((author_staff_id is null) <> (author_client_user_id is null))
);

comment on column portal.chat_messages.author_name is
  'The author''s name as it was when they wrote it. Denormalised on purpose: a reply must still say who said it after they have left.';

create index if not exists chat_messages_conversation_idx
  on portal.chat_messages (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create table if not exists portal.notifications (
  id             uuid primary key default gen_random_uuid(),

  staff_id       uuid references portal.staff(id) on delete cascade,
  client_user_id uuid references portal.client_users(id) on delete cascade,

  /* What happened, in one word, so a screen can group or filter them without
     parsing the sentence. */
  kind           text not null check (kind ~ '^[a-z][a-z0-9_.]*$'),

  title          text not null check (length(btrim(title)) > 0),
  body           text,

  /* Where it happened. Relative, because the tracker and the portal are two
     addresses and a stored absolute one would be wrong in the other. */
  link           text,

  read_at        timestamptz,
  created_at     timestamptz not null default now(),

  constraint notifications_one_recipient
    check ((staff_id is null) <> (client_user_id is null))
);

comment on table portal.notifications is
  'Something worth telling somebody about, shown in the tracker. Rows, not emails: a chat that stops working because SMTP is down is worse than one with no email.';

create index if not exists notifications_staff_unread_idx
  on portal.notifications (staff_id, created_at desc) where read_at is null;

create index if not exists notifications_client_unread_idx
  on portal.notifications (client_user_id, created_at desc) where read_at is null;

-- ---------------------------------------------------------------------------
-- Who is me, on either side.
--
-- Two small helpers so every policy below reads the same way, and so "am I in
-- this conversation" is written once rather than four times with one of them
-- subtly different.
-- ---------------------------------------------------------------------------

create or replace function portal.current_staff_id()
returns uuid language sql stable security definer
set search_path = portal, public
as $$
  select id from portal.staff where auth_user_id = auth.uid() and is_active;
$$;

create or replace function portal.current_client_user_id()
returns uuid language sql stable security definer
set search_path = portal, public
as $$
  select id from portal.client_users where auth_user_id = auth.uid() and is_active;
$$;

create or replace function portal.in_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer
set search_path = portal, public
as $$
  select exists (
    select 1 from portal.conversation_members m
    where m.conversation_id = p_conversation_id
      and (
        (m.staff_id is not null and m.staff_id = portal.current_staff_id())
        or (m.client_user_id is not null and m.client_user_id = portal.current_client_user_id())
      )
  );
$$;

grant execute on function portal.current_staff_id() to authenticated;
grant execute on function portal.current_client_user_id() to authenticated;
grant execute on function portal.in_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Membership is the whole rule: you see a conversation, its members and its
-- messages if and only if you are in it. Nothing here reads a role, because a
-- role decides who may be *added* — which is the trigger's job, above — and
-- reading is decided by whether you were.
-- ---------------------------------------------------------------------------

alter table portal.conversations enable row level security;
alter table portal.conversation_members enable row level security;
alter table portal.chat_messages enable row level security;
alter table portal.notifications enable row level security;

drop policy if exists conversations_members_read on portal.conversations;
create policy conversations_members_read on portal.conversations
  for select to authenticated
  using (portal.in_conversation(id));

drop policy if exists conversations_staff_write on portal.conversations;
create policy conversations_staff_write on portal.conversations
  for all to authenticated
  using (portal.current_staff_id() is not null)
  with check (portal.current_staff_id() is not null);

drop policy if exists conversation_members_read on portal.conversation_members;
create policy conversation_members_read on portal.conversation_members
  for select to authenticated
  using (portal.in_conversation(conversation_id));

/* Only staff add people. A client cannot pull a developer into their thread —
   which is the same rule as the trigger, said at the other end. */
drop policy if exists conversation_members_staff_write on portal.conversation_members;
create policy conversation_members_staff_write on portal.conversation_members
  for all to authenticated
  using (portal.current_staff_id() is not null)
  with check (portal.current_staff_id() is not null);

drop policy if exists chat_messages_read on portal.chat_messages;
create policy chat_messages_read on portal.chat_messages
  for select to authenticated
  using (portal.in_conversation(conversation_id));

/* Write into a conversation you are in, as yourself. The author columns are
   checked against who you actually are, so a forged `author_staff_id` is
   refused rather than believed. */
drop policy if exists chat_messages_write on portal.chat_messages;
create policy chat_messages_write on portal.chat_messages
  for insert to authenticated
  with check (
    portal.in_conversation(conversation_id)
    and (
      (author_staff_id is not null and author_staff_id = portal.current_staff_id())
      or (author_client_user_id is not null
          and author_client_user_id = portal.current_client_user_id())
    )
  );

drop policy if exists notifications_own on portal.notifications;
create policy notifications_own on portal.notifications
  for all to authenticated
  using (
    (staff_id is not null and staff_id = portal.current_staff_id())
    or (client_user_id is not null and client_user_id = portal.current_client_user_id())
  )
  with check (
    (staff_id is not null and staff_id = portal.current_staff_id())
    or (client_user_id is not null and client_user_id = portal.current_client_user_id())
  );

grant select, insert, update, delete on portal.conversations to authenticated;
grant select, insert, update, delete on portal.conversation_members to authenticated;
grant select, insert on portal.chat_messages to authenticated;
grant select, insert, update on portal.notifications to authenticated;

do $say$
begin
  raise notice 'Chat and notifications are in. A client and a plain developer cannot share a conversation — the trigger refuses it in both directions.';
end
$say$;
