-- ===========================================================================
-- One conversation per project.
--
-- The last thing in the specification (§24.5) that had nothing behind it.
--
-- ---------------------------------------------------------------------------
-- There are already three places to say something. Why a fourth.
--
-- **A task comment** is about one piece of work. **A request thread** is about
-- one thing a client asked for. **An approval note** is an answer to a specific
-- question. All three are attached to something, and that is what makes them
-- useful later: the reason for a decision sits next to the decision.
--
-- What none of them holds is the conversation that is about the *project* —
-- "we’re away next week", "the domain has been bought", "who is calling them
-- back". Today that happens on WhatsApp, where nobody joining the project later
-- can read it, and where it is lost the day somebody changes phone.
--
-- So: one thread per project, and no more than one. A per-project chat that also
-- has channels is a chat application, and this is not one.
--
-- ---------------------------------------------------------------------------
-- The same two rules as every other conversation in this schema.
--
-- **`is_internal` is enforced by the policy, not by a screen.** A client’s
-- request for the messages simply does not include them, so there is no
-- condition in any component that could be forgotten — and the database refuses
-- an internal message *from* a client, because a message invisible to its own
-- author the moment it is sent is the most confusing thing this table could do.
--
-- **The author’s name is stored on the row.** People leave. A thread that reads
-- "Someone: yes, go ahead" a year later is worth nothing at exactly the moment
-- it matters.
-- ===========================================================================

create table if not exists portal.project_messages (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references portal.client_projects(id) on delete cascade,

  staff_id       uuid references portal.staff(id) on delete set null,
  client_user_id uuid references portal.client_users(id) on delete set null,
  author_name    text not null,

  body           text not null check (length(btrim(body)) > 0),
  is_internal    boolean not null default false,

  created_at     timestamptz not null default now(),

  constraint project_message_has_one_author check (
    (staff_id is not null)::int + (client_user_id is not null)::int = 1
  ),

  constraint client_project_messages_are_never_internal check (
    client_user_id is null or is_internal = false
  )
);

comment on table portal.project_messages is
  'The conversation about a project as a whole — not about one task, one request or one approval. Internal messages are staff-only and the policy enforces it.';

create index if not exists project_messages_thread_idx
  on portal.project_messages (project_id, created_at desc);

alter table portal.project_messages enable row level security;

grant select, insert on portal.project_messages to authenticated;
grant all on portal.project_messages to service_role;

/*
  Who reads it.

  Staff read everything on any project — the same as the board, and for the same
  reason: a colleague glancing at a project they are not on is normal in a small
  company. A client reads their own project's messages, minus the internal ones.
*/
drop policy if exists project_messages_read on portal.project_messages;
create policy project_messages_read on portal.project_messages
  for select using (
    (portal.is_staff() or portal.client_can_see_project(project_id))
    and (is_internal = false or portal.is_staff())
  );

drop policy if exists project_messages_staff_write on portal.project_messages;
create policy project_messages_staff_write on portal.project_messages
  for insert with check (
    portal.is_staff()
    and staff_id in (select id from portal.staff where auth_user_id = auth.uid())
  );

drop policy if exists project_messages_client_write on portal.project_messages;
create policy project_messages_client_write on portal.project_messages
  for insert with check (
    is_internal = false
    and portal.client_can_see_project(project_id)
    and client_user_id in (
      select id from portal.client_users where auth_user_id = auth.uid()
    )
  );
