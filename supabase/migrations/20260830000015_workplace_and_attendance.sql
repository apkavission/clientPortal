-- ===========================================================================
-- Clocking in from where you are meant to be.
--
-- The owner’s instruction, 2026-08-30:
--
--   > jo clock in aur clock out hai wo radius ke hisaab se hoga. Employee ne jo
--   > address diya hai wo services me daala hai — tracker me clock in karta hai
--   > to radius check hoga ki usi address ke aas-paas ho. Ye free wala hona
--   > chahiye aur proper current location fetch kare.
--
-- The address and the point live in the company website, on the employee’s own
-- record, because that is where employees are created. Added there by
-- `20260830000016_workplace_location.sql`. This migration is the window onto it
-- and the place the readings are kept.
--
-- ---------------------------------------------------------------------------
-- Free, and no third party.
--
-- The location comes from the browser’s own Geolocation API — no key, no bill,
-- and nothing sent anywhere. The point it is measured against was typed in by an
-- admin rather than looked up from an address, so no employee’s home address is
-- ever sent to a geocoding service. That is the owner’s standing rule for this
-- estate and it happens to give a better answer too: a geocoder returns the
-- middle of a street, and standing at the door returns the door.
--
-- ---------------------------------------------------------------------------
-- What is recorded, and what is deliberately not.
--
-- **Two readings a day, and only two.** Where somebody is at 3pm is nobody’s
-- business and is not collected. There is no tracking here, and adding some
-- later would be a decision somebody has to make on purpose rather than a
-- feature that crept in.
--
-- **The distance and the verdict, kept together.** The verdict is stored rather
-- than recomputed later because the fence can be moved: widening somebody’s
-- radius next year must not silently turn last month’s refusals into passes.
--
-- **This is a check, not proof.** A browser’s location can be faked in a few
-- clicks. It stops the ordinary case and it does not stop somebody determined,
-- and the recorded distances are what make a pattern visible over weeks.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Where this person is meant to be.
--
-- The second and last place this schema reads the website’s — the first being
-- `roles_master`. Same shape, same reasoning: a view, one direction, read-only,
-- and no foreign key, so a migration over there can never fail a write here.
--
-- **The view filters by caller.** `security_invoker = false` means it runs with
-- the owner’s rights, which is what lets it cross schemas at all — so without a
-- `where` clause every employee could read every colleague’s home address. The
-- rule is: your own, or all of them if you are an admin.
-- ---------------------------------------------------------------------------

create or replace view portal.staff_workplace
with (security_invoker = false) as
  select
    s.id            as staff_id,
    s.auth_user_id,
    p.address,
    p.work_latitude,
    p.work_longitude,
    p.work_radius_metres
  from portal.staff s
  join company.profiles p on p.id = s.auth_user_id
  where s.auth_user_id = auth.uid() or portal.is_admin();

comment on view portal.staff_workplace is
  'Where each person works, from company.profiles. Read-only, and filtered to the caller unless they are an admin — this view runs with owner rights, so the filter is the access control.';

grant select on portal.staff_workplace to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The readings, on the attendance row they belong to.
--
-- On `attendance` rather than in a table of their own: there are exactly two per
-- day and they are facts about that day’s clock-in and clock-out. A separate
-- table would be a join for no benefit and a place for orphan rows to collect.
-- ---------------------------------------------------------------------------

alter table portal.attendance
  add column if not exists clock_in_lat         numeric(9,6),
  add column if not exists clock_in_lng         numeric(9,6),
  add column if not exists clock_in_accuracy_m  integer,
  add column if not exists clock_in_distance_m  integer,
  add column if not exists clock_in_verdict     text,

  add column if not exists clock_out_lat        numeric(9,6),
  add column if not exists clock_out_lng        numeric(9,6),
  add column if not exists clock_out_accuracy_m integer,
  add column if not exists clock_out_distance_m integer,
  add column if not exists clock_out_verdict    text;

comment on column portal.attendance.clock_in_distance_m is
  'How far from their work address this person was when they started, in metres. A single reading proves nothing; forty of them are a conversation.';
comment on column portal.attendance.clock_in_verdict is
  'inside | borderline | unchecked. Stored rather than recomputed, because moving somebody''s fence later must not rewrite what happened before.';
comment on column portal.attendance.clock_in_accuracy_m is
  'How sure the phone was, in metres, as it reported. Kept because it is what makes a borderline reading readable afterwards.';

/*
  Three verdicts, and "unchecked" is a real one.

  **inside** — within the radius.
  **borderline** — outside it, but inside once the phone's own margin of error is
  allowed for. Accepted, and marked, because refusing somebody who is probably at
  the door is the worse mistake.
  **unchecked** — nobody has set a point for this person yet. Recorded honestly
  rather than dressed up as a pass: a day nobody could check is not a day that
  was checked.
*/
alter table portal.attendance drop constraint if exists attendance_verdicts_are_known;
alter table portal.attendance
  add constraint attendance_verdicts_are_known check (
    (clock_in_verdict  is null or clock_in_verdict  in ('inside','borderline','unchecked'))
    and
    (clock_out_verdict is null or clock_out_verdict in ('inside','borderline','unchecked'))
  );

-- A coordinate pair is a pair. Half of one is a point on the equator.
alter table portal.attendance drop constraint if exists attendance_points_are_whole;
alter table portal.attendance
  add constraint attendance_points_are_whole check (
    (clock_in_lat  is null) = (clock_in_lng  is null)
    and
    (clock_out_lat is null) = (clock_out_lng is null)
  );

/*
  Where a fence is set, the clock refuses a reading outside it — in the
  application, not here.

  Deliberately not a database constraint. A constraint would have to be told what
  the fence is, which means reading another schema on every insert, and the
  failure mode of getting that wrong is that **nobody in the company can clock
  in**. The check that stops the ordinary case belongs where it can be explained
  to the person it refuses; what the database guarantees is that whatever
  happened was written down.
*/

create index if not exists attendance_verdict_idx
  on portal.attendance (clock_in_verdict)
  where clock_in_verdict in ('borderline', 'unchecked');
