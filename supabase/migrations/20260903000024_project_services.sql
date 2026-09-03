-- ===========================================================================
-- What a project actually includes.
--
-- The owner's instruction, 2026-08-31:
--
--   > portal me service select karne ka option do taki pata chale ki isme bas
--   > website hi banana hai ya SEO aur marketing bhi
--
-- ---------------------------------------------------------------------------
-- The gap.
--
-- A project carried a name, a brief, what we will do, and what it costs — and
-- nowhere did it say which of our services it is. "Clinic website and booking"
-- reads as a website to one person and as a website with SEO to another, and
-- the disagreement surfaces at the invoice.
--
-- ---------------------------------------------------------------------------
-- Keys, and the same master-list pattern as roles.
--
-- The catalogue lives in `company.services`, edited in the company website's
-- admin, and is already the list a client reads on the public site. Copying it
-- into this schema would be a second catalogue kept in step by remembering to,
-- which is the mistake this estate keeps almost making — so the column holds
-- slugs and a read-only view is the window onto the names.
--
-- No foreign key, deliberately, exactly as `staff.role_key` has none: a
-- migration on the website must never be able to fail a write in here. A slug
-- that no longer resolves shows as itself rather than vanishing, so a renamed
-- service is visible as a thing to fix rather than silently dropping scope off
-- a project.
-- ===========================================================================

alter table portal.client_projects
  add column if not exists service_keys text[] not null default '{}'::text[];

comment on column portal.client_projects.service_keys is
  'Slugs from company.services — what this project includes. Deliberately not a foreign key: a migration on the website must not be able to fail a write here.';

-- ---------------------------------------------------------------------------
-- The window onto the catalogue.
--
-- Same shape and same reasoning as `portal.roles_master`: read-only, one
-- direction, `security_invoker = false` so staff can read it without a grant
-- on `company.services`.
--
-- Only what a chooser needs. The bodies, pricing and hero copy are the public
-- site's business and there is no reason for this application to see them.
-- ---------------------------------------------------------------------------

create or replace view portal.services_master
with (security_invoker = false) as
  select slug, name, short_name, summary, sort_order,
         -- `status` is the catalogue's own word for it: draft, published,
         -- archived. Flattened to a boolean here because the only question
         -- this application asks is whether to offer it.
         (status = 'published') as is_offered
  from company.services;

comment on view portal.services_master is
  'The service catalogue, read-only. Edited in the company website admin; this is the window onto it, for choosing what a project includes.';

grant select on portal.services_master to authenticated;
