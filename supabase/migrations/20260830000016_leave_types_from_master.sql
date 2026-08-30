-- ===========================================================================
-- Leave types stop being an enum here and start coming from the master list.
--
-- The owner’s instruction, 2026-08-30:
--
--   > jo leave type bhi static mat rakhna samjhe ?? wo bhi admin panel se hi
--   > aayega samjhe ?? master
--
-- The list itself is `company.leave_types`, created by the website’s
-- `20260830000017_leave_types_master.sql` and edited in its admin panel. This
-- migration is the window onto it and the change to the two tables that used the
-- enum.
--
-- ---------------------------------------------------------------------------
-- The same move as roles, for the same reason.
--
-- `portal.leave_kind` was five words fixed in the schema: casual, sick, earned,
-- unpaid, comp_off. A sixth — maternity, bereavement, study — needed a
-- migration and a deploy, which in practice means it never happens and people
-- record the new thing as "casual". Then the numbers stop meaning anything, and
-- nobody notices for a year.
--
-- ---------------------------------------------------------------------------
-- How the change is made without breaking a running application.
--
-- **A new column beside the old one, never a replacement in one step.** The enum
-- column stays and simply stops being read. Dropping it in the same migration
-- that stops using it means any application still running yesterday’s code fails
-- immediately rather than carrying on correctly.
--
-- **The enum column becomes optional**, which is the part that actually matters:
-- while it is `not null`, every insert must still name one of the five old
-- values — so a new type added in the website could never be used, and the whole
-- change would be decoration.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The window onto the master list.
--
-- The third and last thing this schema reads from the website’s — roles, the
-- workplace, and now this. Same shape every time: a view, one direction,
-- read-only, no foreign key. A constraint would mean a migration over there
-- could fail a write over here.
-- ---------------------------------------------------------------------------

create or replace view portal.leave_types_master
with (security_invoker = false) as
  select key, label, description, is_paid, needs_balance, is_active, sort_order
  from company.leave_types;

comment on view portal.leave_types_master is
  'The master leave types, read-only. Edited in the company website admin; this is the window onto them. security_invoker is off so staff can read it without a grant on company.leave_types.';

grant select on portal.leave_types_master to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The two tables that named a kind.
--
-- The enum values and the master keys are the same words, which is what makes
-- this a rename rather than a mapping exercise — and is why the backfill is one
-- line rather than a table of translations.
-- ---------------------------------------------------------------------------

alter table portal.leave_requests
  add column if not exists kind_key text;

alter table portal.leave_entitlements
  add column if not exists kind_key text;

update portal.leave_requests     set kind_key = kind::text where kind_key is null;
update portal.leave_entitlements set kind_key = kind::text where kind_key is null;

alter table portal.leave_requests     alter column kind_key set default 'casual';
alter table portal.leave_entitlements alter column kind_key set default 'casual';

comment on column portal.leave_requests.kind_key is
  'A key in company.leave_types — the master list, edited in the company website admin. Deliberately not a foreign key.';
comment on column portal.leave_requests.kind is
  'SUPERSEDED by kind_key. Kept so old rows stay readable by anything not yet updated.';

/*
  The enum column stops being required.

  This is the line that makes the master list real. While `kind` is `not null`,
  every new request has to name one of the five values the enum knows, and a
  sixth type added in the website could never be asked for.

  It is left in place rather than dropped: it is the only copy of what old rows
  meant if `kind_key` were ever mangled, and it costs nothing to keep.
*/
alter table portal.leave_requests     alter column kind drop not null;
alter table portal.leave_entitlements alter column kind drop not null;

alter table portal.leave_requests     alter column kind drop default;
alter table portal.leave_entitlements alter column kind drop default;

-- ---------------------------------------------------------------------------
-- 3. One entitlement per person, per year, per kind — counted on the new column.
--
-- The old unique constraint is on `(staff_id, year, kind)`, and `kind` is about
-- to be null on every new row — where SQL considers every null distinct, so the
-- constraint would silently stop preventing anything. This is the replacement,
-- and forgetting it would mean somebody’s allowance quietly recorded twice with
-- two different numbers.
-- ---------------------------------------------------------------------------

create unique index if not exists leave_entitlements_one_per_kind
  on portal.leave_entitlements (staff_id, year, kind_key);

create index if not exists leave_requests_kind_idx
  on portal.leave_requests (staff_id, kind_key);

-- ---------------------------------------------------------------------------
-- 4. "What is left" now asks in the new currency.
--
-- Same arithmetic as before — entitlement minus the working days in approved
-- requests — taking a text key rather than an enum value. The old signature is
-- dropped: leaving both would mean two functions with the same name, one of
-- which quietly returns nothing for any type added after today.
-- ---------------------------------------------------------------------------

drop function if exists portal.leave_remaining(uuid, portal.leave_kind, integer);

create or replace function portal.leave_remaining(
  p_staff_id uuid,
  p_kind     text,
  p_year     integer
)
returns numeric
language sql
stable
as $$
  select coalesce(
    (select days from portal.leave_entitlements
      where staff_id = p_staff_id and kind_key = p_kind and year = p_year), 0)
  - coalesce(
    (select sum(portal.leave_days(id)) from portal.leave_requests
      where staff_id = p_staff_id
        and kind_key = p_kind
        and status = 'approved'
        and extract(year from from_date) = p_year), 0);
$$;

comment on function portal.leave_remaining(uuid, text, integer) is
  'Entitlement minus approved working days, for one person, one master leave type, one year. Never stored — a balance that is stored is a balance that can disagree with the requests behind it.';

grant execute on function portal.leave_remaining(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. A request has to name a kind, whichever column it uses.
--
-- With the enum column now optional, nothing else stops a row arriving with
-- neither — which would be a leave request that is not any kind of leave, and it
-- would sit in the list forever because no balance could ever count it.
-- ---------------------------------------------------------------------------

alter table portal.leave_requests drop constraint if exists leave_has_a_kind;
alter table portal.leave_requests
  add constraint leave_has_a_kind
  check (kind_key is not null or kind is not null);

alter table portal.leave_entitlements drop constraint if exists entitlement_has_a_kind;
alter table portal.leave_entitlements
  add constraint entitlement_has_a_kind
  check (kind_key is not null or kind is not null);
