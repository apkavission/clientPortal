-- ===========================================================================
-- Grants that migration 5 missed.
--
-- **What went wrong.** `20260829000005_portal_rls.sql` granted the schema to
-- `authenticated` and stopped there. Supabase gives `service_role` broad rights
-- on `public` as part of setting a project up, and it is easy to assume that
-- extends to a schema you create yourself. It does not. The result was:
--
--     42501 — permission denied for schema portal
--
-- ...from every server-side script, while the application’s own queries would
-- have worked. A gap that shows up only on the maintenance path is the kind
-- that gets found late, so it is written down here rather than quietly fixed.
--
-- **What service_role is for, and what it is not.** It bypasses row-level
-- security, so it is used for exactly two things this application cannot do as
-- the signed-in person: creating a client’s login when they are invited, and
-- reading an invite before anybody is signed in. It is also what seeds test
-- data. Every one of those call sites decides who may reach it *before*
-- calling, because this role means the database will not.
--
-- **Default privileges.** Migration 5 used `grant ... on all tables`, which
-- applies to the tables that existed at that moment and to nothing added later.
-- A table created next month would be invisible to the application and nobody
-- would know until a page came back empty. The `alter default privileges`
-- statements below are what stop that being a recurring surprise.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- service_role — the maintenance path.
-- ---------------------------------------------------------------------------

grant usage on schema portal to service_role;
grant all on all tables in schema portal to service_role;
grant all on all sequences in schema portal to service_role;
grant all on all functions in schema portal to service_role;

alter default privileges in schema portal grant all on tables to service_role;
alter default privileges in schema portal grant all on sequences to service_role;
alter default privileges in schema portal grant all on functions to service_role;

-- ---------------------------------------------------------------------------
-- authenticated — the application itself.
--
-- Repeated from migration 5 so this file can be run on a database that never
-- had it, and extended with the default privileges that were missing. Row-level
-- security still decides which rows; these grants only decide whether the table
-- can be addressed at all.
-- ---------------------------------------------------------------------------

grant usage on schema portal to authenticated;
grant select, insert, update, delete on all tables in schema portal to authenticated;
grant usage, select on all sequences in schema portal to authenticated;
grant execute on all functions in schema portal to authenticated;

alter default privileges in schema portal
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema portal
  grant usage, select on sequences to authenticated;
alter default privileges in schema portal
  grant execute on functions to authenticated;

-- ---------------------------------------------------------------------------
-- anon gets nothing, and that is deliberate.
--
-- There is no page in this application a signed-out person can usefully see,
-- and the sign-in screen queries no table. Leaving `anon` without even schema
-- usage means an unauthenticated request is refused by the grant before any
-- policy is consulted.
-- ---------------------------------------------------------------------------

revoke all on schema portal from anon;
revoke all on all tables in schema portal from anon;

-- ---------------------------------------------------------------------------
-- The first staff row.
--
-- A deadlock otherwise, and worth naming: `staff_write` requires
-- `portal.is_owner()`, which reads `portal.staff` — so the first employee
-- cannot be inserted by any signed-in person, because until that row exists
-- nobody is an owner. It has to come from outside the policies, which means
-- here or from the service role.
--
-- Matched by email against the account that already exists in Supabase auth.
-- Safe to run twice: `on conflict` leaves an existing row alone rather than
-- resetting a role somebody has since changed.
-- ---------------------------------------------------------------------------

insert into portal.staff (auth_user_id, full_name, email, role)
select id, 'Nitish Kumar', email, 'owner'
from auth.users
where email = 'apkavission@gmail.com'
on conflict (auth_user_id) do nothing;
