-- ===========================================================================
-- Roles stop being hard-coded here and start coming from the master list.
--
-- The owner’s instruction, 2026-08-30:
--
--   > role fix mat karna, master dena — jo services wala hai wahi aayega. Jo
--   > bhi employee hoga wo services me daalenge, aur jo client hai wo portal me
--   > daalenge; wahi aayega.
--
-- ---------------------------------------------------------------------------
-- What this changes, and what it costs.
--
-- `portal.staff.role` is an enum: owner, manager, developer, designer, qa. Five
-- words fixed in the schema, in two places, in two applications. Adding a sixth
-- meant a migration, and the company website already has exactly this list as
-- **editable master data** in `company.roles` — labels, ranks, capabilities and
-- default menus, all changeable from its admin panel.
--
-- Two lists of roles is the problem. One of them is always the stale one.
--
-- **The cost, stated plainly.** Until now nothing in `portal` read anything in
-- `company` — that was deliberate, so a change to the website could never break
-- the tracker. This migration breaks that rule in exactly one place: the
-- function that answers "is this person an admin" now looks up the master role.
--
-- Two things keep that dependency thin:
--
--   **It reads one column of one row.** `company.roles.is_owner`, by key.
--   Nothing else crosses.
--
--   **It fails open in the safe direction.** A role key that resolves to
--   nothing is not an admin. So if the master list is renamed out from under
--   this, people lose administrative power rather than gain it — the failure is
--   an inconvenience rather than a breach.
--
-- There is still no foreign key. A constraint would mean a migration over there
-- could fail a write over here, which is the coupling worth avoiding even when
-- the read is not.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The role, as a key into the master list.
--
-- Kept alongside the old enum rather than replacing it in one step. The enum
-- column stays for now and is no longer read: dropping a column in the same
-- migration that stops using it means any application still running the old code
-- fails immediately rather than gracefully.
-- ---------------------------------------------------------------------------

alter table portal.staff
  add column if not exists role_key text;

comment on column portal.staff.role_key is
  'A key in company.roles — the master list, edited in the company website admin. Deliberately not a foreign key: a migration there must not be able to fail a write here.';

comment on column portal.staff.role is
  'SUPERSEDED by role_key. Kept until every application reads the master list, then dropped.';

-- Backfill: the enum values were chosen to match the master keys, which is what
-- makes this a rename rather than a mapping exercise.
update portal.staff
set role_key = role::text
where role_key is null;

-- A staff row with no role reaches nothing, which is the correct answer for a
-- person whose role was deleted rather than a reason to guess one.
alter table portal.staff
  alter column role_key set default 'developer';

create index if not exists staff_role_key_idx on portal.staff (role_key);

-- ---------------------------------------------------------------------------
-- 2. "Is this person an admin" now asks the master list.
--
-- `company.roles.is_owner` is the flag the website already uses to mean "may
-- reach everything, including accounts". The same person should not be an admin
-- in one application and not the other, so the same flag decides both.
--
-- `security definer` so it can read a table in another schema that the caller
-- has no grant on. That is the whole reason this is a function rather than a
-- join in every policy: the dependency exists in one place and can be found by
-- searching for one name.
-- ---------------------------------------------------------------------------

create or replace function portal.is_admin()
returns boolean
language sql
stable
security definer
set search_path = portal, company, public
as $$
  select exists (
    select 1
    from portal.staff s
    join company.roles r on r.key = s.role_key
    where s.auth_user_id = auth.uid()
      and s.is_active
      and r.is_active
      and r.is_owner
  );
$$;

comment on function portal.is_admin() is
  'True for an active staff member whose master role carries is_owner. Reads company.roles — the single place this schema depends on the website''s, and it fails towards "not an admin".';

/*
  Who works here at all.

  Unchanged in meaning and restated here so both halves of the model are in one
  file: being staff is a row in `portal.staff`, and being an admin is what the
  master role says about it. A person can be staff with a role the master list no
  longer has — they keep their work and lose their authority, which is the right
  way round.
*/
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

grant execute on function portal.is_admin() to authenticated;
grant execute on function portal.is_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reading the master list from here.
--
-- A view rather than a grant on `company.roles` itself: this schema needs the
-- three columns that describe a role and has no business with the rest, and a
-- view is where that can be said once.
--
-- Read-only on purpose. Roles are edited in the company website, which is the
-- point of them being master data — two places to add a role is the problem
-- being solved, not a feature to preserve.
-- ---------------------------------------------------------------------------

create or replace view portal.roles_master
with (security_invoker = false) as
  select key, label, description, is_owner, is_staff, is_active, sort_order
  from company.roles;

comment on view portal.roles_master is
  'The master roles, read-only. Edited in the company website admin; this is the window onto them. security_invoker is off so staff can read it without a grant on company.roles.';

grant select on portal.roles_master to authenticated;
