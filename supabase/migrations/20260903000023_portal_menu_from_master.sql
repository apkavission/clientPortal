-- ===========================================================================
-- The portal's default menus start coming from the master list.
--
-- Paired with `services/.../20260903000021_portal_menu_master.sql`, which adds
-- `company.roles.portal_menu` and seeds it with the map that has lived in this
-- application's TypeScript. **Run that one first** — this only widens the
-- window onto it.
--
-- ---------------------------------------------------------------------------
-- Why the map had to move.
--
-- Staff are managed from the company admin now. Per-person grants are stored
-- as a difference from the role's default menu, and a screen over there cannot
-- compute a difference against a default that only exists in a `Record` over
-- here. The choice was to copy the map into the website — a second list of
-- what each role sees, kept in step by remembering to — or to move the one
-- copy somewhere both applications can read. This is the second.
--
-- `portal.roles_master` is already that window: a read-only view, one
-- direction, `security_invoker = false` so staff can read it without a grant
-- on `company.roles`. It gains one column and keeps every property it had.
-- ===========================================================================

create or replace view portal.roles_master
with (security_invoker = false) as
  select key, label, description, is_owner, is_staff, is_active, sort_order,
         portal_menu
  from company.roles;

comment on view portal.roles_master is
  'The master roles, read-only. Edited in the company website admin; this is the window onto them. Carries portal_menu — what each role reaches in this application — so the default menu is master data rather than a map in this repository. security_invoker is off so staff can read it without a grant on company.roles.';

grant select on portal.roles_master to authenticated;
