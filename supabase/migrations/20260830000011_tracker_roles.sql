-- ===========================================================================
-- Three kinds of person in the tracker, and what each may actually do.
--
-- The owner’s requirement, 2026-08-30:
--
--   > task tracker me client ke paas kuch aur power hoga, aur employee ke paas
--   > kuch aur, aur isme admin bhi hoga — ye yaad rakhna.
--
-- So there are three, not two, and they are not a ladder of the same rights:
--
--   **Client**   their own project, the parts marked visible, and nothing that
--                is about how the work is done. They ask; they do not assign.
--   **Employee** the projects they are on. They do the work, move it, and talk
--                about it — including in notes a client never sees.
--   **Admin**    everything, plus the two things that are about power rather
--                than work: putting people on projects, and assigning somebody
--                else’s task to them.
--
-- ---------------------------------------------------------------------------
-- Where each boundary is enforced, and why they are not all in the same place.
--
-- **Client against staff is enforced here, in the database.** It is the boundary
-- that matters: on the wrong side of it a client sees another client’s work, or
-- an internal note about their own. A condition in a component can be forgotten,
-- and the forgetting is invisible until the day it is not.
--
-- **Admin against employee is enforced here too, for writes.** Reading is left
-- open across staff on purpose — the internal panel lists every project, and a
-- colleague being able to look at a project they are not on is a normal thing in
-- a five-person company. Writing is not: assigning work to somebody else, or
-- changing a project you are not on, is the thing that should need to be
-- deliberate.
--
-- That split is stated rather than hidden. If the company grows to the point
-- where reading needs restricting too, this file is where that changes.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Who is an admin.
--
-- `owner` and `manager`. Written as a function so "is this person an admin"
-- has one answer in the database rather than one per policy, exactly like
-- `is_staff()` beside it.
-- ---------------------------------------------------------------------------

create or replace function portal.is_admin()
returns boolean
language sql
stable
security definer
set search_path = portal, public
as $$
  select exists (
    select 1 from portal.staff
    where auth_user_id = auth.uid()
      and is_active
      and role in ('owner', 'manager')
  );
$$;

comment on function portal.is_admin() is
  'True for an active owner or manager. The two things only an admin may do are putting people on projects and assigning work to somebody else.';

-- ---------------------------------------------------------------------------
-- Is this person on this project?
--
-- An employee works on the projects they have been put on. Anything else they
-- may look at, and may not change.
-- ---------------------------------------------------------------------------

create or replace function portal.is_on_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = portal, public
as $$
  select exists (
    select 1
    from portal.project_members m
    join portal.staff s on s.id = m.staff_id
    where m.project_id = p_project_id
      and s.auth_user_id = auth.uid()
      and s.is_active
  );
$$;

comment on function portal.is_on_project(uuid) is
  'True when the caller is an active staff member assigned to that project.';

-- ---------------------------------------------------------------------------
-- Tasks: everyone on staff may read, only the right people may write.
--
-- The read policy is unchanged in effect and restated so this file is the whole
-- story for tasks. The write policy is the new part: an admin, or somebody
-- actually on the project.
--
-- Split into `insert` / `update` / `delete` rather than one `for all`, because
-- `for all` with a `using` clause silently governs reads as well, and a mistake
-- there would hide every task from every employee at once.
-- ---------------------------------------------------------------------------

drop policy if exists tasks_staff_all on portal.tasks;

drop policy if exists tasks_staff_read on portal.tasks;
create policy tasks_staff_read on portal.tasks
  for select using (portal.is_staff());

drop policy if exists tasks_staff_insert on portal.tasks;
create policy tasks_staff_insert on portal.tasks
  for insert with check (portal.is_admin() or portal.is_on_project(project_id));

drop policy if exists tasks_staff_update on portal.tasks;
create policy tasks_staff_update on portal.tasks
  for update using (portal.is_admin() or portal.is_on_project(project_id))
  with check (portal.is_admin() or portal.is_on_project(project_id));

drop policy if exists tasks_staff_delete on portal.tasks;
create policy tasks_staff_delete on portal.tasks
  for delete using (portal.is_admin());

-- ---------------------------------------------------------------------------
-- Who is on a project is an admin’s decision.
--
-- The one thing an employee must not be able to do is add themselves to a
-- project. Everything else about least privilege follows from this row.
-- ---------------------------------------------------------------------------

drop policy if exists members_staff_all on portal.project_members;

drop policy if exists members_staff_read on portal.project_members;
create policy members_staff_read on portal.project_members
  for select using (portal.is_staff());

drop policy if exists members_admin_write on portal.project_members;
create policy members_admin_write on portal.project_members
  for all using (portal.is_admin()) with check (portal.is_admin());

-- The client keeps the narrower view they already had.
drop policy if exists members_client_read on portal.project_members;
create policy members_client_read on portal.project_members
  for select using (is_client_visible and portal.client_can_see_project(project_id));

-- ---------------------------------------------------------------------------
-- Comments: a client may write, and may never write an internal one.
--
-- Restated here because the tracker is where comments are actually used, and
-- because the rule is worth having in one place with the rest of the model.
-- The table’s own constraint says the same thing, so it holds whichever way a
-- row arrives.
-- ---------------------------------------------------------------------------

drop policy if exists task_comments_staff_all on portal.task_comments;

drop policy if exists task_comments_staff_read on portal.task_comments;
create policy task_comments_staff_read on portal.task_comments
  for select using (portal.is_staff());

drop policy if exists task_comments_staff_write on portal.task_comments;
create policy task_comments_staff_write on portal.task_comments
  for insert with check (
    portal.is_staff()
    and author_type = 'team'
    and author_staff_id in (
      select id from portal.staff where auth_user_id = auth.uid()
    )
  );

/*
  Editing a comment is limited to its author, and only their own.

  Not an administrative nicety: a comment is a record of what somebody said, and
  a colleague being able to rewrite it is a record that cannot be relied on. An
  admin may delete one; nobody may put different words in somebody else's mouth.
*/
drop policy if exists task_comments_author_update on portal.task_comments;
create policy task_comments_author_update on portal.task_comments
  for update using (
    author_staff_id in (select id from portal.staff where auth_user_id = auth.uid())
  )
  with check (
    author_staff_id in (select id from portal.staff where auth_user_id = auth.uid())
  );

drop policy if exists task_comments_admin_delete on portal.task_comments;
create policy task_comments_admin_delete on portal.task_comments
  for delete using (portal.is_admin());

-- ---------------------------------------------------------------------------
-- Time entries stay team-only, and now also say who may write one.
--
-- Yours to log, nobody else’s to log for you.
-- ---------------------------------------------------------------------------

drop policy if exists time_entries_staff_all on portal.time_entries;

drop policy if exists time_entries_staff_read on portal.time_entries;
create policy time_entries_staff_read on portal.time_entries
  for select using (portal.is_staff());

drop policy if exists time_entries_own_write on portal.time_entries;
create policy time_entries_own_write on portal.time_entries
  for all using (
    portal.is_admin()
    or staff_id in (select id from portal.staff where auth_user_id = auth.uid())
  )
  with check (
    portal.is_admin()
    or staff_id in (select id from portal.staff where auth_user_id = auth.uid())
  );

grant execute on function portal.is_admin() to authenticated;
grant execute on function portal.is_on_project(uuid) to authenticated;
