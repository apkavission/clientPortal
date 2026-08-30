-- ===========================================================================
-- The working day: attendance, what got done, leave, and the company calendar.
--
-- The owner’s requirement, 2026-08-30:
--
--   > employee ka login/logout hoga, attendance wala cheez hoga, work progress
--   > banayega. Logout se pehle wo ek task banayega ki kya-kya kiya hai aur
--   > kiske liye. Leave request daal sakta hai, aur dekh sakta hai kitna kaun sa
--   > leave hai, aur calendar jisme company ki chhuttiyan admin panel se daali
--   > jayengi.
--
-- **Where these migrations live.** All of them, for the `portal` schema, in this
-- one folder — including the ones whose screens are in the tracker. Two folders
-- writing one schema would mean an ordering that depends on which repository you
-- are standing in, and that breaks quietly and once.
--
-- Three rules shape what follows, and they are the same three as everywhere
-- else in this estate:
--
--   **Nothing derived is stored.** Hours worked come from the clock rows; leave
--   taken comes from the approved requests. A number somebody types drifts from
--   what it summarises, and on a leave balance that drift is an argument.
--
--   **A refusal must say why.** A leave request declined with no reason, an
--   attendance row with no explanation for a missing clock-out — both are rows
--   that raise a question and answer nothing.
--
--   **The database holds the rule, not the screen.** An employee may not approve
--   their own leave, and that is a constraint here rather than a hidden button.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Types.
-- ---------------------------------------------------------------------------

do $$ begin
  create type portal.leave_kind as enum
    ('casual','sick','earned','unpaid','comp_off');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.leave_status as enum ('pending','approved','declined','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal.day_part as enum ('full','first_half','second_half');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 1. Attendance — the clock.
--
-- One row per person per day. `clock_out` is null while they are still working,
-- which is what makes "who is in right now" a query rather than a guess.
--
-- **Worked minutes are not stored.** They are the difference between two
-- timestamps, and a stored copy is a copy that can disagree with them. The one
-- exception a system like this usually makes — storing it "for reporting" — is
-- exactly how a payroll dispute starts.
--
-- A day with a clock-in and no clock-out after the day has passed is a real and
-- common state: somebody forgot. It is left as-is rather than guessed at,
-- because inventing an end time is inventing a fact about somebody’s day.
-- ---------------------------------------------------------------------------

create table if not exists portal.attendance (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references portal.staff(id) on delete cascade,

  on_date       date not null default current_date,
  clock_in      timestamptz not null default now(),
  clock_out     timestamptz,

  -- Set when somebody fixes a forgotten clock-out afterwards, so a corrected
  -- row can never be mistaken for one the clock recorded itself.
  adjusted_by   uuid references portal.staff(id) on delete set null,
  adjust_note   text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (staff_id, on_date),

  constraint attendance_ends_after_it_starts
    check (clock_out is null or clock_out > clock_in),

  -- A corrected row must say who corrected it and why, or the correction is
  -- indistinguishable from the clock having recorded something odd.
  constraint attendance_adjustment_is_explained check (
    adjusted_by is null
    or (adjust_note is not null and length(btrim(adjust_note)) > 0)
  )
);

comment on table portal.attendance is
  'One row per person per day. Minutes worked are the difference between the two timestamps and are never stored.';

create index if not exists attendance_staff_idx on portal.attendance (staff_id, on_date desc);
create index if not exists attendance_open_idx on portal.attendance (on_date) where clock_out is null;

drop trigger if exists attendance_set_updated_at on portal.attendance;
create trigger attendance_set_updated_at
  before update on portal.attendance
  for each row execute function portal.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. What got done, and for whom.
--
-- The owner’s words: before signing off, an employee writes what they did and
-- who it was for. That is this table.
--
-- Deliberately **not** the same thing as a task. A task is a unit of work that
-- may take three days; this is what happened today, in a sentence, attached to
-- the project it was for. Tracking a day’s work by asking somebody to tick tasks
-- fails on the days when the answer is "I spent four hours on a call about it".
--
-- `project_id` is required and `task_id` is not — "for whom" is the question
-- being answered, and that is a project. The task is useful when there is one.
-- ---------------------------------------------------------------------------

create table if not exists portal.work_logs (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references portal.staff(id) on delete cascade,
  project_id    uuid not null references portal.client_projects(id) on delete cascade,
  task_id       uuid references portal.tasks(id) on delete set null,

  on_date       date not null default current_date,
  minutes       integer not null check (minutes > 0 and minutes <= 1440),
  summary       text not null check (length(btrim(summary)) > 0),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table portal.work_logs is
  'What one person did on one project on one day, in their own words. Written before signing off.';

create index if not exists work_logs_staff_idx on portal.work_logs (staff_id, on_date desc);
create index if not exists work_logs_project_idx on portal.work_logs (project_id, on_date desc);

drop trigger if exists work_logs_set_updated_at on portal.work_logs;
create trigger work_logs_set_updated_at
  before update on portal.work_logs
  for each row execute function portal.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. The company calendar.
--
-- Holidays are put in by an admin. `is_optional` covers the ones a person may
-- choose to take or not, which is ordinary here and is a different thing from a
-- day the office is shut.
-- ---------------------------------------------------------------------------

create table if not exists portal.holidays (
  id            uuid primary key default gen_random_uuid(),
  on_date       date not null,
  name          text not null check (length(btrim(name)) > 0),
  is_optional   boolean not null default false,
  note          text,

  created_by    uuid references portal.staff(id) on delete set null,
  created_at    timestamptz not null default now(),

  unique (on_date, name)
);

comment on column portal.holidays.is_optional is
  'A day somebody may choose to take. Different from a day the office is shut, and shown differently.';

create index if not exists holidays_date_idx on portal.holidays (on_date);

-- ---------------------------------------------------------------------------
-- 4. Leave — what somebody is owed, and what they have asked for.
--
-- **The entitlement is typed; the balance is not.** How many days a person gets
-- in a year is a decision somebody makes. How many they have left is arithmetic
-- over the approved requests, and storing it would mean two numbers that must be
-- kept in step — which they will not be, and the day they disagree is the day
-- somebody is told they cannot take leave they have.
-- ---------------------------------------------------------------------------

create table if not exists portal.leave_entitlements (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references portal.staff(id) on delete cascade,
  year          integer not null check (year between 2020 and 2100),
  kind          portal.leave_kind not null,
  days          numeric(5,1) not null check (days >= 0),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (staff_id, year, kind)
);

comment on table portal.leave_entitlements is
  'How many days of each kind somebody gets in a year. Set by an admin. What is left is worked out, never stored.';

drop trigger if exists leave_entitlements_set_updated_at on portal.leave_entitlements;
create trigger leave_entitlements_set_updated_at
  before update on portal.leave_entitlements
  for each row execute function portal.set_updated_at();

create table if not exists portal.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references portal.staff(id) on delete cascade,

  kind          portal.leave_kind not null default 'casual',
  from_date     date not null,
  to_date       date not null,
  day_part      portal.day_part not null default 'full',
  reason        text,

  status        portal.leave_status not null default 'pending',
  decided_by    uuid references portal.staff(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint leave_dates_make_sense check (to_date >= from_date),

  -- Half a day is half of one day. A half-day spanning a fortnight is a typo.
  constraint leave_half_day_is_one_day check (
    day_part = 'full' or from_date = to_date
  ),

  -- A declined request must say why. Being told no by nobody, for no reason, is
  -- the thing people remember about a system like this.
  constraint leave_decline_is_explained check (
    status <> 'declined'
    or (decision_note is not null and length(btrim(decision_note)) > 0)
  ),

  -- Anything decided must record who decided it and when.
  constraint leave_decision_is_complete check (
    status in ('pending','cancelled')
    or (decided_by is not null and decided_at is not null)
  )
);

comment on table portal.leave_requests is
  'Asked for, and answered. A decline must carry a reason; every decision records who made it.';

create index if not exists leave_requests_staff_idx
  on portal.leave_requests (staff_id, from_date desc);
create index if not exists leave_requests_open_idx
  on portal.leave_requests (status, from_date) where status = 'pending';

drop trigger if exists leave_requests_set_updated_at on portal.leave_requests;
create trigger leave_requests_set_updated_at
  before update on portal.leave_requests
  for each row execute function portal.set_updated_at();

/*
  Nobody approves their own leave.

  A rule people assume is enforced and usually is not. Put here rather than in a
  screen, because a screen can be bypassed by anything that writes to the table —
  and the person most able to write directly is exactly the person this stops.
*/
create or replace function portal.leave_not_self_approved()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('approved','declined')
     and new.decided_by is not null
     and new.decided_by = new.staff_id then
    raise exception 'A leave request cannot be decided by the person who asked for it.';
  end if;
  return new;
end;
$$;

drop trigger if exists leave_requests_not_self_approved on portal.leave_requests;
create trigger leave_requests_not_self_approved
  before insert or update on portal.leave_requests
  for each row execute function portal.leave_not_self_approved();

-- ---------------------------------------------------------------------------
-- Days taken, counted rather than stored.
--
-- Weekends and company holidays are not leave. Counting them would mean a
-- fortnight off costs fourteen days instead of ten, and the first person it
-- happens to will be right to complain.
-- ---------------------------------------------------------------------------

create or replace function portal.leave_days(p_request_id uuid)
returns numeric
language plpgsql
stable
as $$
declare
  request record;
  day     date;
  total   numeric := 0;
begin
  select from_date, to_date, day_part into request
  from portal.leave_requests where id = p_request_id;

  if not found then return 0; end if;
  if request.day_part <> 'full' then return 0.5; end if;

  day := request.from_date;
  while day <= request.to_date loop
    -- 0 is Sunday, 6 is Saturday.
    if extract(dow from day) not in (0, 6)
       and not exists (select 1 from portal.holidays h where h.on_date = day and not h.is_optional)
    then
      total := total + 1;
    end if;
    day := day + 1;
  end loop;

  return total;
end;
$$;

comment on function portal.leave_days(uuid) is
  'Working days in a request: weekends and non-optional company holidays do not count.';

/** What somebody has left of one kind this year. Entitlement minus approved. */
create or replace function portal.leave_remaining(
  p_staff_id uuid,
  p_kind portal.leave_kind,
  p_year integer
)
returns numeric
language sql
stable
as $$
  select coalesce(
    (select days from portal.leave_entitlements
      where staff_id = p_staff_id and kind = p_kind and year = p_year), 0)
  - coalesce(
    (select sum(portal.leave_days(id)) from portal.leave_requests
      where staff_id = p_staff_id
        and kind = p_kind
        and status = 'approved'
        and extract(year from from_date) = p_year), 0);
$$;

-- ---------------------------------------------------------------------------
-- 5. Priority is an admin’s decision.
--
-- The owner’s line: high-priority work is given, not claimed. An employee can
-- do the work and say it is blocked; whether it jumps the queue is a decision
-- about everybody else’s week, and that belongs with whoever is holding the
-- whole picture.
--
-- Enforced as a trigger rather than a policy because it is about one column
-- rather than one row: an employee may update a task freely and may not raise
-- its priority above normal.
-- ---------------------------------------------------------------------------

create or replace function portal.priority_is_an_admin_decision()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.priority is not distinct from old.priority then
    return new;
  end if;

  if new.priority in ('high','urgent') and not portal.is_admin() then
    raise exception 'Only an admin can mark work high or urgent.';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_priority_is_admin on portal.tasks;
create trigger tasks_priority_is_admin
  before insert or update of priority on portal.tasks
  for each row execute function portal.priority_is_an_admin_decision();

-- ---------------------------------------------------------------------------
-- Security. Everything new is staff-only; none of it is a client’s business.
-- ---------------------------------------------------------------------------

alter table portal.attendance          enable row level security;
alter table portal.work_logs           enable row level security;
alter table portal.holidays            enable row level security;
alter table portal.leave_entitlements  enable row level security;
alter table portal.leave_requests      enable row level security;

-- Attendance: yours to record, everybody’s to see, an admin’s to correct.
drop policy if exists attendance_read on portal.attendance;
create policy attendance_read on portal.attendance
  for select using (portal.is_staff());

drop policy if exists attendance_own_write on portal.attendance;
create policy attendance_own_write on portal.attendance
  for all using (
    portal.is_admin()
    or staff_id in (select id from portal.staff where auth_user_id = auth.uid())
  )
  with check (
    portal.is_admin()
    or staff_id in (select id from portal.staff where auth_user_id = auth.uid())
  );

-- Work logs: the same shape. What you did is yours to write.
drop policy if exists work_logs_read on portal.work_logs;
create policy work_logs_read on portal.work_logs
  for select using (portal.is_staff());

drop policy if exists work_logs_own_write on portal.work_logs;
create policy work_logs_own_write on portal.work_logs
  for all using (
    portal.is_admin()
    or staff_id in (select id from portal.staff where auth_user_id = auth.uid())
  )
  with check (
    portal.is_admin()
    or staff_id in (select id from portal.staff where auth_user_id = auth.uid())
  );

-- The calendar: everybody reads it, an admin writes it.
drop policy if exists holidays_read on portal.holidays;
create policy holidays_read on portal.holidays
  for select using (portal.is_staff());

drop policy if exists holidays_admin_write on portal.holidays;
create policy holidays_admin_write on portal.holidays
  for all using (portal.is_admin()) with check (portal.is_admin());

-- Entitlements: yours to see, an admin’s to set.
drop policy if exists entitlements_read on portal.leave_entitlements;
create policy entitlements_read on portal.leave_entitlements
  for select using (portal.is_staff());

drop policy if exists entitlements_admin_write on portal.leave_entitlements;
create policy entitlements_admin_write on portal.leave_entitlements
  for all using (portal.is_admin()) with check (portal.is_admin());

/*
  Leave requests: ask for your own, and only an admin decides.

  Split so that an employee can raise and cancel their own and cannot touch the
  decision columns — the trigger above stops self-approval even for an admin
  asking for their own leave.
*/
drop policy if exists leave_read on portal.leave_requests;
create policy leave_read on portal.leave_requests
  for select using (portal.is_staff());

drop policy if exists leave_own_insert on portal.leave_requests;
create policy leave_own_insert on portal.leave_requests
  for insert with check (
    status = 'pending'
    and decided_by is null
    and staff_id in (select id from portal.staff where auth_user_id = auth.uid())
  );

drop policy if exists leave_own_cancel on portal.leave_requests;
create policy leave_own_cancel on portal.leave_requests
  for update using (
    status = 'pending'
    and staff_id in (select id from portal.staff where auth_user_id = auth.uid())
  )
  with check (status in ('pending','cancelled') and decided_by is null);

drop policy if exists leave_admin_decide on portal.leave_requests;
create policy leave_admin_decide on portal.leave_requests
  for update using (portal.is_admin()) with check (portal.is_admin());

-- ---------------------------------------------------------------------------
-- Grants. Named per table, because `on all tables` covers only what existed.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  portal.attendance, portal.work_logs, portal.holidays,
  portal.leave_entitlements, portal.leave_requests
  to authenticated;

grant all on
  portal.attendance, portal.work_logs, portal.holidays,
  portal.leave_entitlements, portal.leave_requests
  to service_role;

grant execute on function portal.leave_days(uuid) to authenticated;
grant execute on function portal.leave_remaining(uuid, portal.leave_kind, integer) to authenticated;
