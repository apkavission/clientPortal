-- ===========================================================================
-- The portal schema: types, staff, clients and their logins.
--
-- This application owns `portal` and nothing else. The company website owns
-- `company` in the same database, and the two are deliberately not joined —
-- the owner’s rule on 2026-08-29 was that neither project may be able to break
-- the other. So there is no foreign key, no view and no function here that
-- reads a table over there.
--
-- **What that costs, stated plainly.** The website already has a `profiles`
-- table with roles, and this schema needs its own `staff` table saying the same
-- kind of thing. Two lists of employees now exist and a person who joins or
-- leaves has to be added or removed in both. That is the price of the
-- independence, and it is a real one; it is written here rather than
-- discovered later.
--
-- Both applications sign in against the same Supabase auth, so one person has
-- one login and one password. It is only the *authorisation* — what they may
-- do in each application — that is kept separate.
--
-- NOTHING IS RUN AUTOMATICALLY. By this project’s convention the owner runs
-- each migration in the Supabase SQL editor, in file-name order.
-- ===========================================================================

create schema if not exists portal;

-- ---------------------------------------------------------------------------
-- Types.
--
-- Enums rather than text with a check, because these are read by the
-- application as a closed set: the generated TypeScript turns each one into a
-- union, so a status the code does not handle fails to compile instead of
-- reaching a page as an unstyled word.
-- ---------------------------------------------------------------------------

do $$ begin
  create type portal.project_stage as enum
    ('discovery','design','development','testing','launch','support','on_hold','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.phase_status as enum ('not_started','in_progress','blocked','done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.task_status as enum
    ('backlog','todo','in_progress','in_review','blocked','done','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.task_priority as enum ('low','normal','high','urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.request_status as enum
    ('submitted','under_review','accepted','declined','converted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.health as enum ('on_track','at_risk','delayed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.staff_role as enum ('owner','manager','developer','designer','qa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.client_user_role as enum ('primary','member','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.member_role as enum ('lead','developer','designer','qa','manager');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.requirement_source as enum ('contract','client_request','internal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.requirement_status as enum
    ('agreed','in_progress','delivered','accepted','dropped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.approval_status as enum ('pending','approved','changes_requested');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.file_category as enum ('document','design','deliverable','reference');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.actor_type as enum ('team','client','system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.client_status as enum ('prospect','active','paused','closed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest.
-- ---------------------------------------------------------------------------

create or replace function portal.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- staff — who works here, as far as this application is concerned.
--
-- Deliberately not `company.profiles`. See the note at the top of this file.
--
-- `auth_user_id` is the join to Supabase auth and is unique: one login is one
-- staff member. A row with `is_active = false` keeps the history of what they
-- did while removing every door — the policies below all test it.
-- ---------------------------------------------------------------------------

create table if not exists portal.staff (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  full_name     text not null check (length(btrim(full_name)) > 0),
  email         text,
  role          portal.staff_role not null default 'developer',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table portal.staff is
  'Employees, for this application only. The company website keeps its own list; a person who joins or leaves must be added or removed in both.';

create index if not exists staff_active_idx on portal.staff (is_active, role);

drop trigger if exists staff_set_updated_at on portal.staff;
create trigger staff_set_updated_at
  before update on portal.staff
  for each row execute function portal.set_updated_at();

-- ---------------------------------------------------------------------------
-- clients — the companies we work for.
--
-- `lead_id` points at `company.leads` and carries **no foreign key on purpose**.
-- The link is worth having: it closes the loop from an enquiry to the client it
-- became. A constraint would mean a migration on the website could fail a write
-- in here, which is exactly the coupling this schema exists without.
-- ---------------------------------------------------------------------------

create table if not exists portal.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) > 0),
  company_name  text,
  email         text,
  phone         text,
  whatsapp      text,
  gst           text,
  address       text,
  status        portal.client_status not null default 'active',
  notes         text,

  -- company.leads(id). Unenforced by design — see above.
  lead_id       uuid,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column portal.clients.lead_id is
  'The enquiry this client came from, in company.leads. Intentionally not a foreign key: the two schemas must not be able to break each other.';

create index if not exists clients_status_idx on portal.clients (status, name);

drop trigger if exists clients_set_updated_at on portal.clients;
create trigger clients_set_updated_at
  before update on portal.clients
  for each row execute function portal.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_users — the people at a client who can sign in.
--
-- More than one person from a company may have a login. `primary` is the one
-- who can invite their own colleagues; `viewer` can read and nothing else.
--
-- `auth_user_id` is null until the invite is accepted, which is what makes an
-- invited-but-not-yet-joined person a real, listable state rather than a row
-- that does not exist yet.
-- ---------------------------------------------------------------------------

create table if not exists portal.client_users (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references portal.clients(id) on delete cascade,
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  full_name     text not null check (length(btrim(full_name)) > 0),
  email         text not null check (position('@' in email) > 1),
  role          portal.client_user_role not null default 'member',
  is_active     boolean not null default true,

  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table portal.client_users is
  'People at a client company who can sign in. auth_user_id is null until the invite is accepted.';

-- One email per client. The same person may legitimately belong to two
-- different clients, so the constraint is on the pair rather than on the email.
create unique index if not exists client_users_email_per_client_idx
  on portal.client_users (client_id, lower(email));

create index if not exists client_users_client_idx on portal.client_users (client_id, is_active);

drop trigger if exists client_users_set_updated_at on portal.client_users;
create trigger client_users_set_updated_at
  before update on portal.client_users
  for each row execute function portal.set_updated_at();

-- ---------------------------------------------------------------------------
-- Who is who, as functions.
--
-- Every policy in `..._rls.sql` is written in terms of these three. Defining
-- them once means "is this person staff?" has exactly one answer in the
-- database, and a policy that gets it wrong is a bug in one place rather than
-- in twenty.
--
-- `security definer` so they can read `portal.staff` and `portal.client_users`
-- while those tables are themselves behind policies — without it every policy
-- would recurse into the policy on the table it is checking.
-- ---------------------------------------------------------------------------

create or replace function portal.is_staff()
returns boolean
language sql
stable
security definer
set search_path = portal, public
as $$
  select exists (
    select 1 from portal.staff
    where auth_user_id = auth.uid() and is_active
  );
$$;

create or replace function portal.is_owner()
returns boolean
language sql
stable
security definer
set search_path = portal, public
as $$
  select exists (
    select 1 from portal.staff
    where auth_user_id = auth.uid() and is_active and role in ('owner','manager')
  );
$$;

/*
  The client this person belongs to, or null if they are not a client user.

  Returns one id rather than a set: a login belongs to one client company, which
  the unique constraint on `auth_user_id` above enforces.
*/
create or replace function portal.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = portal, public
as $$
  select client_id from portal.client_users
  where auth_user_id = auth.uid() and is_active
  limit 1;
$$;

comment on function portal.is_staff() is
  'True when the caller is an active employee. Every staff policy is written in terms of this.';
comment on function portal.current_client_id() is
  'The client company the caller belongs to, or null. Every client policy is written in terms of this.';
