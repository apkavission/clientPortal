-- ===========================================================================
-- The portal's side of retiring the Owner role.
--
-- Paired with `services/supabase/migrations/20260903000019_one_admin_role.sql`,
-- which merges Owner into Admin in `company.roles` — the master list this
-- schema has read since 20260830000014. **Run that one first.** This moves the
-- keys on this side across to match it.
--
-- ---------------------------------------------------------------------------
-- Two columns, one of which is a ghost.
--
-- `portal.staff` carries the role twice:
--
--   **`role_key`** — text, a key into `company.roles`. Added in
--   20260830000014 and described there as the one that counts.
--   **`role`** — `portal.staff_role`, the original enum, marked SUPERSEDED in
--   that same migration and to be dropped "until every application reads the
--   master list, then dropped".
--
-- That day has not arrived. `src/lib/auth/session.ts` still reads
-- `session.staff.role` — the enum — to decide who may open the team screen, so
-- the half-finished transition is load-bearing in exactly the place it claimed
-- not to be. The enum has its own 'owner', which is a *different* owner from
-- the one in the master list, and keeping the two in step by hand is what made
-- the word mean three things.
--
-- So both move. The enum keeps its values — dropping a value from a Postgres
-- enum is not a thing you can do, and rewriting the type is a heavier
-- operation than this is worth while the column is still being read. What
-- changes is that no row is left on 'owner', in either column, and the
-- application stops reading the enum in the same change.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The key into the master list.
--
-- 'admin' is what 'owner' became over there, so this is the same rename
-- expressed on this side. A staff row whose key resolves to nothing is not an
-- admin — the master-list lookup fails closed — so leaving one behind would
-- quietly remove somebody's access rather than move it.
-- ---------------------------------------------------------------------------

update portal.staff
set role_key = 'admin'
where role_key = 'owner';

-- ---------------------------------------------------------------------------
-- 2. The superseded enum, kept consistent while it still exists.
--
-- 'manager' rather than a new value: the enum cannot gain 'admin' inside a
-- transaction that also uses it, and the portal's own checks have always
-- treated owner and manager as the same authority —
--
--     if (session.staff.role !== "owner" && session.staff.role !== "manager")
--
-- — so this preserves the behaviour exactly while the column is read, and
-- becomes irrelevant the moment it is not. The application is being moved to
-- `role_key` in the same change as this migration.
-- ---------------------------------------------------------------------------

update portal.staff
set role = 'manager'
where role = 'owner';

comment on column portal.staff.role is
  'SUPERSEDED by role_key, and no longer read by the application as of 2026-08-31. Kept only so an older deploy does not fail on a missing column. Drop once nothing has read it for a release.';

do $say$
declare
  admins integer;
  strays integer;
begin
  select count(*) into admins from portal.staff where role_key = 'admin';
  select count(*) into strays from portal.staff where role_key = 'owner' or role = 'owner';

  raise notice 'Portal staff on admin: %. Rows still saying owner: % (expected 0).', admins, strays;
end
$say$;
