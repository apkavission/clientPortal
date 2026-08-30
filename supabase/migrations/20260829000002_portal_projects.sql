-- ===========================================================================
-- Projects, phases, the people on them, the agreed scope, and milestones.
--
-- Named `client_projects` rather than `projects`, exactly as the spec says, so
-- it can never be confused with `company.projects` — which is the public
-- portfolio on the website and a completely different thing. Two tables called
-- `projects` in one database, meaning different things, is a mistake somebody
-- makes once at 1am.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- client_projects
--
-- `progress_percent` and `health` are stored but **never written by a form**.
-- They are maintained by the triggers in `..._portal_progress.sql`. A stored
-- derived value is a cache: it exists so a list of twelve projects is one query
-- rather than twelve, and the trigger is what keeps it honest.
--
-- `is_client_visible` lets a project exist in the tracker before the client is
-- told about it — the usual state for the first day or two of a job.
-- ---------------------------------------------------------------------------

create table if not exists portal.client_projects (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references portal.clients(id) on delete cascade,

  name              text not null check (length(btrim(name)) > 0),
  slug              text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  summary           text,

  stage             portal.project_stage not null default 'discovery',
  health            portal.health not null default 'on_track',

  start_date        date,
  target_date       date,
  actual_end_date   date,

  -- Derived. See the note above and the trigger migration.
  progress_percent  integer not null default 0
                      check (progress_percent between 0 and 100),

  contract_value    numeric(12,2) check (contract_value is null or contract_value >= 0),
  currency          text not null default 'INR',

  is_client_visible boolean not null default false,
  archived_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A date range that runs backwards is a typo, and it produces a timeline the
  -- client reads as a mistake in the software rather than in the data.
  constraint client_projects_dates_make_sense
    check (target_date is null or start_date is null or target_date >= start_date)
);

comment on table portal.client_projects is
  'A job for a client. progress_percent and health are derived by trigger — never set them from a form.';

-- The address a client sees is /portal/p/<slug>, so it has to be unique across
-- the estate rather than only within one client.
create unique index if not exists client_projects_slug_idx on portal.client_projects (slug);
create index if not exists client_projects_client_idx
  on portal.client_projects (client_id, archived_at, stage);

drop trigger if exists client_projects_set_updated_at on portal.client_projects;
create trigger client_projects_set_updated_at
  before update on portal.client_projects
  for each row execute function portal.set_updated_at();

-- ---------------------------------------------------------------------------
-- project_phases
--
-- `weight` is what makes a project’s percentage mean something: a two-week
-- development phase should not count the same as a one-day launch phase. It
-- defaults to 1 so a project nobody has thought about still averages sensibly.
-- ---------------------------------------------------------------------------

create table if not exists portal.project_phases (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references portal.client_projects(id) on delete cascade,

  name              text not null check (length(btrim(name)) > 0),
  description       text,
  sort_order        integer not null default 0,

  status            portal.phase_status not null default 'not_started',
  start_date        date,
  target_date       date,
  completed_at      timestamptz,

  weight            numeric(5,2) not null default 1 check (weight > 0),
  progress_percent  integer not null default 0
                      check (progress_percent between 0 and 100),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column portal.project_phases.weight is
  'How much of the project this phase represents. Used to weight the project percentage; a two-week phase should not count the same as a one-day one.';

create index if not exists project_phases_project_idx
  on portal.project_phases (project_id, sort_order);

drop trigger if exists project_phases_set_updated_at on portal.project_phases;
create trigger project_phases_set_updated_at
  before update on portal.project_phases
  for each row execute function portal.set_updated_at();

-- ---------------------------------------------------------------------------
-- project_members
--
-- `is_client_visible` is the point of this table rather than a detail of it.
-- A client should be able to see who is building their software; they should
-- not see everyone who has ever touched the repository. One column, decided per
-- person per project.
-- ---------------------------------------------------------------------------

create table if not exists portal.project_members (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references portal.client_projects(id) on delete cascade,
  staff_id          uuid not null references portal.staff(id) on delete cascade,

  role              portal.member_role not null default 'developer',
  is_client_visible boolean not null default true,
  assigned_at       timestamptz not null default now(),

  unique (project_id, staff_id)
);

comment on column portal.project_members.is_client_visible is
  'Whether this person appears on the client''s "who is working on this" list.';

create index if not exists project_members_staff_idx on portal.project_members (staff_id);

-- ---------------------------------------------------------------------------
-- requirements — the agreed scope, itemised.
--
-- This is what answers "how much is done and how much is left" with something
-- more meaningful than a task count. A task list grows as work is discovered;
-- the scope is what was agreed, and a client asking the question means the
-- second one.
-- ---------------------------------------------------------------------------

create table if not exists portal.requirements (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references portal.client_projects(id) on delete cascade,
  phase_id      uuid references portal.project_phases(id) on delete set null,

  title         text not null check (length(btrim(title)) > 0),
  description   text,
  source        portal.requirement_source not null default 'contract',
  status        portal.requirement_status not null default 'agreed',
  sort_order    integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table portal.requirements is
  'What was agreed, item by item. Distinct from tasks: tasks are how the work is done, requirements are what was promised.';

create index if not exists requirements_project_idx
  on portal.requirements (project_id, sort_order);

drop trigger if exists requirements_set_updated_at on portal.requirements;
create trigger requirements_set_updated_at
  before update on portal.requirements
  for each row execute function portal.set_updated_at();

-- ---------------------------------------------------------------------------
-- milestones and approvals
--
-- An approval is a question put to the client with a recorded answer. It exists
-- as a row rather than as a WhatsApp message because "you approved this on the
-- 14th" needs to be something both sides can look at.
-- ---------------------------------------------------------------------------

create table if not exists portal.milestones (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references portal.client_projects(id) on delete cascade,

  name              text not null check (length(btrim(name)) > 0),
  description       text,
  due_date          date,
  completed_at      timestamptz,
  requires_approval boolean not null default false,
  payment_note      text,
  sort_order        integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists milestones_project_idx on portal.milestones (project_id, sort_order);

drop trigger if exists milestones_set_updated_at on portal.milestones;
create trigger milestones_set_updated_at
  before update on portal.milestones
  for each row execute function portal.set_updated_at();

create table if not exists portal.approvals (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references portal.client_projects(id) on delete cascade,
  milestone_id  uuid references portal.milestones(id) on delete cascade,
  phase_id      uuid references portal.project_phases(id) on delete cascade,

  title         text not null check (length(btrim(title)) > 0),
  detail        text,

  status        portal.approval_status not null default 'pending',
  requested_by  uuid references portal.staff(id) on delete set null,
  responded_by  uuid references portal.client_users(id) on delete set null,
  note          text,

  requested_at  timestamptz not null default now(),
  responded_at  timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- An answered approval must say who answered and when. Without this a row can
  -- claim the client approved something with nothing behind the claim.
  constraint approvals_answer_is_complete check (
    status = 'pending'
    or (responded_at is not null and responded_by is not null)
  )
);

comment on constraint approvals_answer_is_complete on portal.approvals is
  'An approval that is not pending must record who responded and when. "The client approved it" is a claim that needs evidence.';

create index if not exists approvals_project_idx on portal.approvals (project_id, status);

drop trigger if exists approvals_set_updated_at on portal.approvals;
create trigger approvals_set_updated_at
  before update on portal.approvals
  for each row execute function portal.set_updated_at();
