-- ===========================================================================
-- Tasks, comments, client requests, files and the activity feed.
--
-- This is the half of the schema the day-to-day work happens in: the developer
-- board reads `tasks`, the client’s "what is happening" reads `activity_log`,
-- and `client_requests` is the queue that keeps the two from colliding.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- tasks
--
-- Two columns carry most of the weight here.
--
-- `is_client_visible` decides whether this appears in the client’s list at all,
-- and it is also what the progress calculation counts — so a project’s
-- percentage is measured against the work the client was told about, not
-- against internal chores. Refactoring the build script should not move the
-- number the client is looking at.
--
-- `created_by_type` records whether the team or the client put this here. A
-- task that came from a client request is worth being able to point at months
-- later, when somebody asks whether something was in the original scope.
-- ---------------------------------------------------------------------------

create table if not exists portal.tasks (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references portal.client_projects(id) on delete cascade,
  phase_id          uuid references portal.project_phases(id) on delete set null,
  requirement_id    uuid references portal.requirements(id) on delete set null,

  title             text not null check (length(btrim(title)) > 0),
  description       text,

  status            portal.task_status not null default 'backlog',
  priority          portal.task_priority not null default 'normal',

  assignee_id       uuid references portal.staff(id) on delete set null,
  created_by        uuid references portal.staff(id) on delete set null,
  created_by_type   portal.actor_type not null default 'team',

  due_date          date,
  estimate_hours    numeric(6,2) check (estimate_hours is null or estimate_hours >= 0),
  logged_hours      numeric(6,2) not null default 0 check (logged_hours >= 0),

  sort_order        integer not null default 0,
  is_client_visible boolean not null default true,
  blocked_reason    text,
  completed_at      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A blocked task with no reason is the least useful row in the system: it
  -- stops the work and says nothing about why, and the person who blocked it
  -- has forgotten by the time anybody asks.
  constraint tasks_blocked_says_why check (
    status <> 'blocked' or (blocked_reason is not null and length(btrim(blocked_reason)) > 0)
  )
);

comment on constraint tasks_blocked_says_why on portal.tasks is
  'A blocked task must say what is blocking it. Business rule, not a formality.';

comment on column portal.tasks.is_client_visible is
  'Whether the client sees this task — and whether it counts toward the percentage they are shown. Internal chores should not move the client''s number.';

create index if not exists tasks_project_idx on portal.tasks (project_id, status, sort_order);
create index if not exists tasks_assignee_idx on portal.tasks (assignee_id, status);
create index if not exists tasks_phase_idx on portal.tasks (phase_id);

drop trigger if exists tasks_set_updated_at on portal.tasks;
create trigger tasks_set_updated_at
  before update on portal.tasks
  for each row execute function portal.set_updated_at();

/*
  `completed_at` follows the status rather than being typed.

  Set when a task becomes done, cleared when it stops being done. A date that
  has to be maintained by hand alongside a status is a date that will disagree
  with it.
*/
create or replace function portal.sync_task_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at = now();
  elsif new.status <> 'done' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_sync_completed_at on portal.tasks;
create trigger tasks_sync_completed_at
  before insert or update of status on portal.tasks
  for each row execute function portal.sync_task_completed_at();

-- ---------------------------------------------------------------------------
-- task_comments
--
-- `is_internal` is a column and not a condition in a component. Row-level
-- security filters it before the row leaves Postgres, so no forgotten `if` in a
-- page can show a client an internal note. That distinction is the whole reason
-- the flag is in the database.
-- ---------------------------------------------------------------------------

create table if not exists portal.task_comments (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references portal.tasks(id) on delete cascade,

  author_staff_id   uuid references portal.staff(id) on delete set null,
  author_client_id  uuid references portal.client_users(id) on delete set null,
  author_type       portal.actor_type not null default 'team',

  body              text not null check (length(btrim(body)) > 0),
  is_internal       boolean not null default false,
  attachments       jsonb not null default '[]'::jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A comment written by the team cannot also be written by the client.
  constraint task_comments_one_author check (
    (author_type = 'team'   and author_client_id is null)
    or (author_type = 'client' and author_staff_id is null)
    or author_type = 'system'
  ),

  -- A client cannot leave an internal note; the phrase is a contradiction, and
  -- allowing it would create a row that hides a client’s own words from them.
  constraint task_comments_client_notes_are_not_internal check (
    author_type <> 'client' or is_internal = false
  )
);

create index if not exists task_comments_task_idx on portal.task_comments (task_id, created_at);

drop trigger if exists task_comments_set_updated_at on portal.task_comments;
create trigger task_comments_set_updated_at
  before update on portal.task_comments
  for each row execute function portal.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_requests — the queue.
--
-- A client asking for something does not create a task. It creates a request,
-- which somebody reads and either turns into a task or declines with a reason.
--
-- That queue is the feature, not a bureaucratic step: a client who can write
-- straight into the task list can change the scope of a fixed-price project
-- without anyone noticing, and the first time it is noticed is when the work
-- runs late. `is_scope_change` is the flag that makes that conversation happen
-- at the right moment.
-- ---------------------------------------------------------------------------

create table if not exists portal.client_requests (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references portal.client_projects(id) on delete cascade,
  client_user_id    uuid references portal.client_users(id) on delete set null,

  title             text not null check (length(btrim(title)) > 0),
  description       text,
  attachments       jsonb not null default '[]'::jsonb,

  status            portal.request_status not null default 'submitted',
  reviewed_by       uuid references portal.staff(id) on delete set null,
  review_note       text,
  converted_task_id uuid references portal.tasks(id) on delete set null,
  is_scope_change   boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Declining without saying why is the single most damaging thing this screen
  -- could allow: the client is told no, by nobody, for no reason.
  constraint client_requests_declined_says_why check (
    status <> 'declined'
    or (review_note is not null and length(btrim(review_note)) > 0)
  ),

  -- "Converted" means a task exists. Without this the status can claim work
  -- was started that nothing points to.
  constraint client_requests_converted_has_a_task check (
    status <> 'converted' or converted_task_id is not null
  )
);

comment on constraint client_requests_declined_says_why on portal.client_requests is
  'A declined request must carry a reason. Telling a client no without one is worse than not having the feature.';

create index if not exists client_requests_project_idx
  on portal.client_requests (project_id, status, created_at);

drop trigger if exists client_requests_set_updated_at on portal.client_requests;
create trigger client_requests_set_updated_at
  before update on portal.client_requests
  for each row execute function portal.set_updated_at();

-- ---------------------------------------------------------------------------
-- project_files
--
-- The file itself lives in storage; this row is the record of what it is, who
-- put it there, and whether the client may see it. `media_id` is a bare uuid
-- for the same reason `clients.lead_id` is — the website’s media library must
-- not be able to break this table.
-- ---------------------------------------------------------------------------

create table if not exists portal.project_files (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references portal.client_projects(id) on delete cascade,

  filename          text not null check (length(btrim(filename)) > 0),
  storage_key       text not null,
  mime_type         text,
  size_bytes        bigint check (size_bytes is null or size_bytes >= 0),

  category          portal.file_category not null default 'document',
  is_client_visible boolean not null default true,
  version           integer not null default 1 check (version >= 1),

  uploaded_by       uuid references portal.staff(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists project_files_project_idx
  on portal.project_files (project_id, category, created_at);

-- ---------------------------------------------------------------------------
-- activity_log — what happened, in order.
--
-- Written by triggers rather than by the application, so the feed cannot fall
-- out of step with the data it describes. A feed maintained by remembering to
-- call a function is a feed that is wrong the first time somebody forgets.
-- ---------------------------------------------------------------------------

create table if not exists portal.activity_log (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references portal.client_projects(id) on delete cascade,

  actor_type        portal.actor_type not null default 'system',
  actor_staff_id    uuid references portal.staff(id) on delete set null,
  actor_client_id   uuid references portal.client_users(id) on delete set null,

  action            text not null,
  entity            text not null,
  entity_id         uuid,
  summary           text not null,
  is_client_visible boolean not null default true,

  created_at        timestamptz not null default now()
);

create index if not exists activity_log_project_idx
  on portal.activity_log (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- time_entries — team only, and never exposed to the portal.
--
-- There is no policy anywhere that lets a client user select from this table.
-- That is deliberate and it is the reason it lives in its own section: hours
-- spent are our business, not the client’s, and a fixed-price project where the
-- client can see the hours is a project that turns into an argument about them.
-- ---------------------------------------------------------------------------

create table if not exists portal.time_entries (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references portal.tasks(id) on delete cascade,
  staff_id      uuid not null references portal.staff(id) on delete cascade,

  minutes       integer not null check (minutes > 0),
  note          text,
  logged_on     date not null default current_date,

  created_at    timestamptz not null default now()
);

comment on table portal.time_entries is
  'Team only. No policy grants a client user any access to this table, by design.';

create index if not exists time_entries_task_idx on portal.time_entries (task_id, logged_on);
create index if not exists time_entries_staff_idx on portal.time_entries (staff_id, logged_on);
