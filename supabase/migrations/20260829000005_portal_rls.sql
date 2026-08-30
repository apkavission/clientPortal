-- ===========================================================================
-- Row-level security.
--
-- The rule this file implements, in one sentence: **a client sees their own
-- projects and only the parts of them marked visible; the team sees
-- everything; nobody else sees anything.**
--
-- This is the layer that cannot be forgotten. The application checks who may
-- open a page, and that check can be missed when somebody adds a route in a
-- hurry. These policies are applied by Postgres to every query from every
-- client, including one written at 1am, including one written by somebody who
-- has not read this file. If both layers were removed except one, this is the
-- one to keep.
--
-- Every policy is written in terms of the three functions in
-- `..._portal_foundation.sql` — `is_staff()`, `is_owner()`,
-- `current_client_id()` — so "who is this?" has exactly one answer in the
-- database rather than one per table.
--
-- **Default deny.** Enabling RLS with no policy denies everything, so a table
-- added later and forgotten here is invisible rather than open. That is the
-- right way round for this to fail.
-- ===========================================================================

alter table portal.staff            enable row level security;
alter table portal.clients          enable row level security;
alter table portal.client_users     enable row level security;
alter table portal.client_projects  enable row level security;
alter table portal.project_phases   enable row level security;
alter table portal.project_members  enable row level security;
alter table portal.requirements     enable row level security;
alter table portal.milestones       enable row level security;
alter table portal.approvals        enable row level security;
alter table portal.tasks            enable row level security;
alter table portal.task_comments    enable row level security;
alter table portal.client_requests  enable row level security;
alter table portal.project_files    enable row level security;
alter table portal.activity_log     enable row level security;
alter table portal.time_entries     enable row level security;

-- ---------------------------------------------------------------------------
-- staff
--
-- Everyone on the team can see the team — a task list showing "assigned to
-- 8f3a…" instead of a name would be useless. Only an owner or manager may
-- change it, because editing this table is how somebody grants themselves
-- access to every client’s data.
-- ---------------------------------------------------------------------------

drop policy if exists staff_read on portal.staff;
create policy staff_read on portal.staff
  for select using (portal.is_staff());

drop policy if exists staff_write on portal.staff;
create policy staff_write on portal.staff
  for all using (portal.is_owner()) with check (portal.is_owner());

-- ---------------------------------------------------------------------------
-- clients and their logins
--
-- A client user may read their own company’s record and the colleagues who
-- share it. They may not read another client, and the policy is written as an
-- equality against `current_client_id()` rather than as a join, so there is no
-- path where a crafted filter widens it.
-- ---------------------------------------------------------------------------

drop policy if exists clients_staff_all on portal.clients;
create policy clients_staff_all on portal.clients
  for all using (portal.is_staff()) with check (portal.is_staff());

drop policy if exists clients_own_read on portal.clients;
create policy clients_own_read on portal.clients
  for select using (id = portal.current_client_id());

drop policy if exists client_users_staff_all on portal.client_users;
create policy client_users_staff_all on portal.client_users
  for all using (portal.is_staff()) with check (portal.is_staff());

drop policy if exists client_users_own_read on portal.client_users;
create policy client_users_own_read on portal.client_users
  for select using (client_id = portal.current_client_id());

/*
  A person may edit their own name, and nothing else about their row.

  `role` and `is_active` are deliberately not protected here by column — the
  application never offers them, and the check below keeps the row on the same
  client, which is the part that would matter if it did.
*/
drop policy if exists client_users_self_update on portal.client_users;
create policy client_users_self_update on portal.client_users
  for update using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid() and client_id = portal.current_client_id());

-- ---------------------------------------------------------------------------
-- projects
--
-- Two conditions, and both matter. The project must belong to this client, and
-- it must be marked visible: a job exists in the tracker before the client is
-- told about it, and `is_client_visible` is what makes that a normal state
-- rather than a leak.
-- ---------------------------------------------------------------------------

drop policy if exists projects_staff_all on portal.client_projects;
create policy projects_staff_all on portal.client_projects
  for all using (portal.is_staff()) with check (portal.is_staff());

drop policy if exists projects_client_read on portal.client_projects;
create policy projects_client_read on portal.client_projects
  for select using (
    client_id = portal.current_client_id()
    and is_client_visible
    and archived_at is null
  );

/*
  Does the caller's client own this project, and may they see it?

  Written once because eleven policies below need exactly this test, and eleven
  hand-written copies of a security condition is eleven chances to write it
  slightly differently.
*/
create or replace function portal.client_can_see_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = portal, public
as $$
  select exists (
    select 1 from portal.client_projects
    where id = p_project_id
      and client_id = portal.current_client_id()
      and is_client_visible
      and archived_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- phases, requirements, milestones — visible with the project.
-- ---------------------------------------------------------------------------

drop policy if exists phases_staff_all on portal.project_phases;
create policy phases_staff_all on portal.project_phases
  for all using (portal.is_staff()) with check (portal.is_staff());

drop policy if exists phases_client_read on portal.project_phases;
create policy phases_client_read on portal.project_phases
  for select using (portal.client_can_see_project(project_id));

drop policy if exists requirements_staff_all on portal.requirements;
create policy requirements_staff_all on portal.requirements
  for all using (portal.is_staff()) with check (portal.is_staff());

drop policy if exists requirements_client_read on portal.requirements;
create policy requirements_client_read on portal.requirements
  for select using (portal.client_can_see_project(project_id));

drop policy if exists milestones_staff_all on portal.milestones;
create policy milestones_staff_all on portal.milestones
  for all using (portal.is_staff()) with check (portal.is_staff());

drop policy if exists milestones_client_read on portal.milestones;
create policy milestones_client_read on portal.milestones
  for select using (portal.client_can_see_project(project_id));

-- ---------------------------------------------------------------------------
-- project_members — only the ones marked visible.
-- ---------------------------------------------------------------------------

drop policy if exists members_staff_all on portal.project_members;
create policy members_staff_all on portal.project_members
  for all using (portal.is_staff()) with check (portal.is_staff());

drop policy if exists members_client_read on portal.project_members;
create policy members_client_read on portal.project_members
  for select using (is_client_visible and portal.client_can_see_project(project_id));

-- ---------------------------------------------------------------------------
-- tasks
--
-- `is_client_visible` again, and this is the one place it is doing security
-- work rather than presentation. The internal task list is not hidden by a
-- component choosing not to render it; the rows do not come back.
-- ---------------------------------------------------------------------------

drop policy if exists tasks_staff_all on portal.tasks;
create policy tasks_staff_all on portal.tasks
  for all using (portal.is_staff()) with check (portal.is_staff());

drop policy if exists tasks_client_read on portal.tasks;
create policy tasks_client_read on portal.tasks
  for select using (is_client_visible and portal.client_can_see_project(project_id));

-- ---------------------------------------------------------------------------
-- task_comments
--
-- An internal note never leaves Postgres for a client. That is why
-- `is_internal` is a column: a condition in a component can be forgotten, and
-- the forgetting is invisible until the day it is not.
--
-- A client may add a comment on a task they can see, and it may not be
-- internal — the table’s own constraint says the same thing, so the rule holds
-- whether the row arrives through this policy or any other route.
-- ---------------------------------------------------------------------------

drop policy if exists task_comments_staff_all on portal.task_comments;
create policy task_comments_staff_all on portal.task_comments
  for all using (portal.is_staff()) with check (portal.is_staff());

drop policy if exists task_comments_client_read on portal.task_comments;
create policy task_comments_client_read on portal.task_comments
  for select using (
    is_internal = false
    and exists (
      select 1 from portal.tasks t
      where t.id = task_id
        and t.is_client_visible
        and portal.client_can_see_project(t.project_id)
    )
  );

drop policy if exists task_comments_client_write on portal.task_comments;
create policy task_comments_client_write on portal.task_comments
  for insert with check (
    author_type = 'client'
    and is_internal = false
    and author_client_id in (
      select id from portal.client_users where auth_user_id = auth.uid()
    )
    and exists (
      select 1 from portal.tasks t
      where t.id = task_id
        and t.is_client_visible
        and portal.client_can_see_project(t.project_id)
    )
  );

-- ---------------------------------------------------------------------------
-- client_requests — the client writes here, and only here.
--
-- Insert is theirs; the review columns are not. The `with check` on their
-- update keeps a request in `submitted` while they are still editing it, so
-- nobody can mark their own request accepted.
-- ---------------------------------------------------------------------------

drop policy if exists requests_staff_all on portal.client_requests;
create policy requests_staff_all on portal.client_requests
  for all using (portal.is_staff()) with check (portal.is_staff());

drop policy if exists requests_client_read on portal.client_requests;
create policy requests_client_read on portal.client_requests
  for select using (portal.client_can_see_project(project_id));

drop policy if exists requests_client_insert on portal.client_requests;
create policy requests_client_insert on portal.client_requests
  for insert with check (
    portal.client_can_see_project(project_id)
    and status = 'submitted'
    and reviewed_by is null
    and converted_task_id is null
    and client_user_id in (
      select id from portal.client_users where auth_user_id = auth.uid()
    )
  );

drop policy if exists requests_client_update on portal.client_requests;
create policy requests_client_update on portal.client_requests
  for update using (
    status = 'submitted'
    and client_user_id in (
      select id from portal.client_users where auth_user_id = auth.uid()
    )
  )
  with check (status = 'submitted' and reviewed_by is null);

-- ---------------------------------------------------------------------------
-- approvals — the client answers, and may not ask.
-- ---------------------------------------------------------------------------

drop policy if exists approvals_staff_all on portal.approvals;
create policy approvals_staff_all on portal.approvals
  for all using (portal.is_staff()) with check (portal.is_staff());

drop policy if exists approvals_client_read on portal.approvals;
create policy approvals_client_read on portal.approvals
  for select using (portal.client_can_see_project(project_id));

drop policy if exists approvals_client_respond on portal.approvals;
create policy approvals_client_respond on portal.approvals
  for update using (portal.client_can_see_project(project_id) and status = 'pending')
  with check (
    portal.client_can_see_project(project_id)
    and status in ('approved','changes_requested')
    and responded_by in (
      select id from portal.client_users where auth_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- files and activity — read with the project, marked visible.
-- ---------------------------------------------------------------------------

drop policy if exists files_staff_all on portal.project_files;
create policy files_staff_all on portal.project_files
  for all using (portal.is_staff()) with check (portal.is_staff());

drop policy if exists files_client_read on portal.project_files;
create policy files_client_read on portal.project_files
  for select using (is_client_visible and portal.client_can_see_project(project_id));

drop policy if exists activity_staff_all on portal.activity_log;
create policy activity_staff_all on portal.activity_log
  for all using (portal.is_staff()) with check (portal.is_staff());

drop policy if exists activity_client_read on portal.activity_log;
create policy activity_client_read on portal.activity_log
  for select using (is_client_visible and portal.client_can_see_project(project_id));

-- ---------------------------------------------------------------------------
-- time_entries — staff only, and there is no second policy on purpose.
--
-- Hours spent are ours. On a fixed-price job, a client who can see them is a
-- client who ends up negotiating them, and the number was never part of what
-- was agreed. The absence of a client policy here is the feature.
-- ---------------------------------------------------------------------------

drop policy if exists time_entries_staff_all on portal.time_entries;
create policy time_entries_staff_all on portal.time_entries
  for all using (portal.is_staff()) with check (portal.is_staff());

-- ---------------------------------------------------------------------------
-- Grants.
--
-- RLS decides which rows; grants decide whether the table can be addressed at
-- all. Both are needed: a policy on a table with no grant is a table nobody can
-- query, and a grant with no policy is a table everybody can read.
-- ---------------------------------------------------------------------------

grant usage on schema portal to authenticated;
grant select, insert, update, delete on all tables in schema portal to authenticated;

-- `anon` gets nothing. There is no page in this application a signed-out person
-- can usefully see, and the sign-in screen needs no table.
revoke all on all tables in schema portal from anon;
