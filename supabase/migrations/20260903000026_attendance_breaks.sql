-- ===========================================================================
-- Breaks, so the hours on a payslip are the hours that were worked.
--
-- The owner's instruction, 2026-08-31:
--
--   > jab ka click in and out aur kitna hours kaam kiya aur kitne break liya
--   > hai ... taki salary ban sake
--
-- ---------------------------------------------------------------------------
-- **Why a table and not two more columns on `attendance`.**
--
-- A day has one clock-in and one clock-out; it has any number of breaks. Two
-- columns would hold the first one and quietly lose the rest, and the day
-- somebody takes lunch and then a second break is the day the figure stops
-- being true — silently, which is the worst way for a payroll number to be
-- wrong.
--
-- ---------------------------------------------------------------------------
-- **An open break is a real state**, so `ended_at` is nullable: somebody is on
-- their break right now. What is refused is a *second* open break on the same
-- attendance row, which is what a double-tap on the button would otherwise
-- create — and two overlapping breaks would subtract the same minutes twice.
-- The partial unique index is what makes that impossible rather than unlikely.
--
-- ---------------------------------------------------------------------------
-- **The worked figure is derived, never stored.** `worked_minutes` subtracts
-- breaks from the clocked span at read time. A stored total would be one more
-- thing that can disagree with the rows underneath it, and the rows are what
-- somebody will be shown when they ask why their pay is short.
-- ===========================================================================

create table if not exists portal.attendance_breaks (
  id            uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references portal.attendance(id) on delete cascade,

  started_at    timestamptz not null default now(),
  ended_at      timestamptz,

  /* Optional and short. "Lunch" is the whole of what most of these need to
     say, and a required box would be filled with a full stop. */
  note          text check (note is null or length(btrim(note)) > 0),

  created_at    timestamptz not null default now(),

  constraint attendance_breaks_end_after_start
    check (ended_at is null or ended_at >= started_at)
);

comment on table portal.attendance_breaks is
  'Breaks within one attendance row. Any number per day; at most one open at a time. Worked time is the clocked span minus these.';

create index if not exists attendance_breaks_attendance_idx
  on portal.attendance_breaks (attendance_id, started_at);

-- At most one break running at once, per day.
create unique index if not exists attendance_breaks_one_open_idx
  on portal.attendance_breaks (attendance_id)
  where ended_at is null;

-- ---------------------------------------------------------------------------
-- Row-level security: the same rule the attendance row itself follows.
--
-- Somebody may read and write the breaks on their own day. An estate owner may
-- read everybody's, because payroll is computed from them — and may not write
-- them, because a break somebody did not take is not a thing an administrator
-- should be able to add to their day.
-- ---------------------------------------------------------------------------

alter table portal.attendance_breaks enable row level security;

drop policy if exists attendance_breaks_own on portal.attendance_breaks;
create policy attendance_breaks_own on portal.attendance_breaks
  for all to authenticated
  using (
    exists (
      select 1
      from portal.attendance a
      join portal.staff s on s.id = a.staff_id
      where a.id = attendance_breaks.attendance_id
        and s.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from portal.attendance a
      join portal.staff s on s.id = a.staff_id
      where a.id = attendance_breaks.attendance_id
        and s.auth_user_id = auth.uid()
    )
  );

drop policy if exists attendance_breaks_admin_read on portal.attendance_breaks;
create policy attendance_breaks_admin_read on portal.attendance_breaks
  for select to authenticated
  using (portal.is_admin());

grant select, insert, update, delete on portal.attendance_breaks to authenticated;

-- ---------------------------------------------------------------------------
-- What was actually worked, in minutes.
--
-- Null clock-out means still on the clock, and the answer is null rather than
-- a number counted up to now: a figure that grows while you look at it is not
-- a figure anybody can check against a payslip.
--
-- An unfinished break at the end of a finished day counts to the clock-out,
-- which is the honest reading — somebody who clocked out without ending their
-- break was not working during it.
-- ---------------------------------------------------------------------------

create or replace function portal.worked_minutes(p_attendance_id uuid)
returns integer
language sql
stable
security invoker
set search_path = portal, public
as $$
  select case
    when a.clock_out is null then null
    else greatest(
      0,
      (extract(epoch from (a.clock_out - a.clock_in)) / 60)::integer
        - coalesce((
            select sum(
              extract(epoch from (coalesce(b.ended_at, a.clock_out) - b.started_at)) / 60
            )::integer
            from portal.attendance_breaks b
            where b.attendance_id = a.id
          ), 0)
    )
  end
  from portal.attendance a
  where a.id = p_attendance_id;
$$;

comment on function portal.worked_minutes(uuid) is
  'Clocked span minus breaks, in minutes. Null while somebody is still clocked in — a total that grows while you look at it cannot be checked against a payslip.';

grant execute on function portal.worked_minutes(uuid) to authenticated;
