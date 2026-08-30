-- ===========================================================================
-- This application becomes the company’s internal admin.
--
-- **The correction.** What was built first was a task board: somewhere to move
-- work along, and nowhere to create a client, set up a project, write down what
-- was agreed, or find everything about one job in one place. The owner looked at
-- it on 2026-08-30 and said so:
--
--   > kaha pe project add karna h, aur kaha pe saara detail bharenge jo docs me
--   > mention hoga jo client ko send karenge, aur kaha pe us project ka sab kuch
--   > dekhenge — ye sab kaha pe hai?
--
-- The answer was nowhere, and that is a fair thing to be annoyed about. A
-- tracker without the screens that create what it tracks is half a product.
--
-- **The split, settled the same day.** The task tracker and the client portal
-- are two different things. This application is the internal one — the company’s
-- own panel. What a client sees becomes its own project later, reading the same
-- tables.
--
-- Two things this migration adds.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. A menu is a permission, and it is per person.
--
-- The same model the company website uses, because the owner asked for the same
-- behaviour: a role carries a default set of screens, and one named person can
-- be given more or have some taken away.
--
-- Kept as `text[]` rather than an enum on purpose. The set of screens is the
-- application’s own structure, not content — it changes when a screen is built,
-- and a screen should not need a migration to exist.
--
-- **Taken away wins.** The two arrays may not overlap, and the constraint says
-- so, so a mistake that both grants and revokes the same screen fails closed
-- rather than resolving to whichever the code happens to apply last.
-- ---------------------------------------------------------------------------

alter table portal.staff
  add column if not exists menu_extra  text[] not null default '{}'::text[],
  add column if not exists menu_denied text[] not null default '{}'::text[];

comment on column portal.staff.menu_extra is
  'Screens this person reaches beyond their role default.';
comment on column portal.staff.menu_denied is
  'Screens taken away from this person''s role default. Wins over menu_extra.';

alter table portal.staff drop constraint if exists staff_menu_disjoint;
alter table portal.staff
  add constraint staff_menu_disjoint check (not (menu_extra && menu_denied));

-- ---------------------------------------------------------------------------
-- 2. The commercial detail a client document is written from.
--
-- The owner’s words: "saara detail bharenge jo docs me mention hoga jo client ko
-- send karenge". A proposal, an agreement or an invoice is assembled from what
-- was agreed — the price, the terms, when payment is due, what is excluded. None
-- of that had anywhere to live, so it was being kept in WhatsApp, which is where
-- it gets lost.
--
-- Document *generation* is a later phase (spec §27). This is the data entry it
-- will be built on, and it is useful on its own long before that exists: a
-- project whose terms are written down is one anybody can answer a question
-- about.
--
-- `exclusions` is here because it is the half everyone forgets and the half that
-- ends arguments. What a project does not include is worth a column of its own.
-- ---------------------------------------------------------------------------

alter table portal.client_projects
  add column if not exists terms          text,
  add column if not exists payment_terms  text,
  add column if not exists exclusions     text,
  add column if not exists internal_notes text;

comment on column portal.client_projects.terms is
  'What was agreed, in the words that go into the client document.';
comment on column portal.client_projects.payment_terms is
  'How and when payment is due. Read straight into a proposal or invoice.';
comment on column portal.client_projects.exclusions is
  'What this project does NOT include. The half that ends arguments, and the half everybody forgets to write down.';
comment on column portal.client_projects.internal_notes is
  'Ours. Never rendered anywhere a client can reach, and no policy grants a client user access to this table at all.';
