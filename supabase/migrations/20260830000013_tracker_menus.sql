-- ===========================================================================
-- Two more things the owner asked for on 2026-08-30.
--
--   > ho sakta hai main ek employee banaun aur usko role manager dekar ye panel
--   > de dun, aur ho sakta hai kuch hi menu dun manager ko — wo bhi kar dena.
--
--   > client panel wala bas task dekh sakta hai … aur kuch agar add-on ya
--   > request karna ho ya priority pe task dena ho wo de sakta hai.
--
-- ---------------------------------------------------------------------------
-- 1. A menu is a permission, in the tracker too — and per person.
--
-- The same model the internal panel uses: a role carries a default set of
-- screens, and one named person can be given more or have some taken away.
--
-- **Its own columns, and not the panel’s.** `staff.menu_extra` and
-- `menu_denied` already exist and hold the *internal panel’s* screen keys. The
-- two applications have different screens, and one pair of columns holding both
-- sets would mean a key granted in one silently appearing in the other — or,
-- worse, a key removed from one taking a screen away in the other.
--
-- The asymmetric naming is deliberate rather than untidy: the unprefixed pair
-- was there first and renaming it would break the panel. A comment on each
-- column says which application it belongs to, which is the thing somebody
-- actually needs to know at 1am.
-- ---------------------------------------------------------------------------

alter table portal.staff
  add column if not exists tracker_menu_extra  text[] not null default '{}'::text[],
  add column if not exists tracker_menu_denied text[] not null default '{}'::text[];

comment on column portal.staff.menu_extra is
  'Screens this person reaches beyond their role default IN THE INTERNAL PANEL.';
comment on column portal.staff.menu_denied is
  'Screens taken away from this person''s role default IN THE INTERNAL PANEL.';
comment on column portal.staff.tracker_menu_extra is
  'Screens this person reaches beyond their role default IN THE TASK TRACKER.';
comment on column portal.staff.tracker_menu_denied is
  'Screens taken away from this person''s role default IN THE TASK TRACKER. Wins over tracker_menu_extra.';

alter table portal.staff drop constraint if exists staff_tracker_menu_disjoint;
alter table portal.staff
  add constraint staff_tracker_menu_disjoint
  check (not (tracker_menu_extra && tracker_menu_denied));

-- ---------------------------------------------------------------------------
-- 2. A client can say something is urgent. They cannot make it urgent.
--
-- The distinction matters and it is the whole reason this is a separate column
-- from `tasks.priority`.
--
-- **What a client knows** is that this one thing is holding them up. That is
-- real information and there was nowhere to put it — so it arrived by phone, to
-- whoever answered, and never reached the board.
--
-- **What a client cannot know** is what else is in the week. Three clients each
-- marking their own request urgent produces three urgent requests and no
-- ordering, which is the same as none of them being urgent. So this flag is what
-- they said, and `tasks.priority` — an admin’s decision, enforced by a trigger in
-- the previous migration — is what happens.
--
-- Recording both means the conversation later is about two facts rather than two
-- memories.
-- ---------------------------------------------------------------------------

alter table portal.client_requests
  add column if not exists is_urgent boolean not null default false,
  add column if not exists urgency_reason text;

comment on column portal.client_requests.is_urgent is
  'The client said this is holding them up. What they said — not what happens. tasks.priority is the decision, and only an admin can set it.';
comment on column portal.client_requests.urgency_reason is
  'Why they say it is urgent. Asked for, because "urgent" on its own cannot be acted on or argued with.';

-- Marking something urgent has to say what is being held up. Without it the
-- flag becomes something everybody ticks and nobody reads.
alter table portal.client_requests drop constraint if exists requests_urgency_is_explained;
alter table portal.client_requests
  add constraint requests_urgency_is_explained check (
    is_urgent = false
    or (urgency_reason is not null and length(btrim(urgency_reason)) > 0)
  );

create index if not exists client_requests_urgent_idx
  on portal.client_requests (project_id, is_urgent)
  where is_urgent and status in ('submitted', 'under_review');
