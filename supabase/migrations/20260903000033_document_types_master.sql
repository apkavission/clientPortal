-- ===========================================================================
-- Document kinds become master data, like roles and leave types.
--
-- ---------------------------------------------------------------------------
-- **What was wrong with the enum.**
--
-- `portal.document_kind` listed five kinds in the schema: offer letter, salary
-- slip, invoice, contract, other. Adding a sixth — an experience letter, a
-- purchase order, an NDA — meant a migration, a deploy, and a developer.
--
-- That is the same mistake the roles list made and the owner already ruled on:
-- a hard-coded list in code is the second list, and the second list is always
-- the stale one. `roles_master`, `leave_types_master` and `services_master` are
-- all here because of that rule. This is the fourth.
--
-- ---------------------------------------------------------------------------
-- **What stays fixed, and why that is not the same thing.**
--
-- Four kinds keep meaning something to the code: a salary slip must name a
-- month, an invoice must carry an amount, an offer letter must be to a person.
-- Those are not styling — they are what makes the row that kind of document,
-- and a salary slip with no month would simply disappear from the screen that
-- lists them by month.
--
-- So the *list* is data and the *rules* are declared on each row: whether it
-- belongs to a person or a company, whether it needs a period, whether it needs
-- an amount. A new kind added tomorrow picks its own rules from those switches
-- without anybody touching this file.
-- ===========================================================================

create table portal.document_types (
  /* The stable name the code and the data both use. Renaming one silently
     detaches every document already filed under it, so the label is what
     changes when somebody wants different wording. */
  key text primary key,
  label text not null,

  /*
    Who a document of this kind belongs to.

    'staff' for an offer letter or a salary slip, 'client' for an invoice,
    'both' for a contract or anything else. It is what the create form offers
    and what the check below enforces.
  */
  belongs_to text not null default 'both'
    check (belongs_to in ('staff', 'client', 'both')),

  /* Whether a document of this kind is meaningless without a month, or
     without a sum. Declared per kind rather than written into a constraint,
     which is the whole point of the list being data. */
  needs_period boolean not null default false,
  needs_amount boolean not null default false,

  /* Whether it is normally waiting on signatures when it is created. A
     default the form offers, not a rule — an unsigned copy of a signed
     contract is still a real thing to file. */
  signs_by_default boolean not null default false,

  sort_order integer not null default 0,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table portal.document_types is
  'The kinds of document that exist, as data. Master data like roles_master and leave_types_master: adding a kind is an admin editing a row, not a migration.';

create trigger document_types_updated_at
  before update on portal.document_types
  for each row execute function portal.set_updated_at();

insert into portal.document_types
  (key, label, belongs_to, needs_period, needs_amount, signs_by_default, sort_order)
values
  ('offer_letter', 'Offer letter',  'staff',  false, false, true,  10),
  ('salary_slip',  'Salary slip',   'staff',  true,  true,  false, 20),
  ('invoice',      'Invoice',       'client', false, true,  false, 30),
  ('contract',     'Contract',      'both',   false, false, true,  40),
  ('other',        'Other',         'both',   false, false, false, 90);

-- ---------------------------------------------------------------------------
-- The column moves from the enum to the list.
--
-- Nothing has been filed yet, so this is a clean swap rather than the
-- two-columns-for-a-while dance `leave_requests.kind` had to do.
-- ---------------------------------------------------------------------------

alter table portal.documents
  drop constraint documents_salary_slip_is_complete,
  drop constraint documents_invoice_is_complete,
  drop constraint documents_offer_letter_is_to_a_person;

drop index portal.documents_one_slip_per_period;

alter table portal.documents
  add column kind_key text
    references portal.document_types (key) on update cascade;

update portal.documents set kind_key = kind::text;

alter table portal.documents
  alter column kind_key set not null,
  drop column kind;

drop type portal.document_kind;

create index documents_kind_idx on portal.documents (kind_key);

/*
  One salary slip per person per period, as before — but keyed on whichever
  kinds actually need a period, rather than on the word 'salary_slip'.

  A partial index cannot ask another table, so this names the kinds it covers.
  It is the one place a kind is still written down, and it fails safe: a new
  period-bearing kind added tomorrow simply is not deduplicated until somebody
  adds it here, rather than being refused.
*/
create unique index documents_one_per_period
  on portal.documents (staff_id, kind_key, period_start, period_end)
  where period_start is not null;

-- ---------------------------------------------------------------------------
-- The shape rules, now read from the kind's own row.
--
-- A constraint cannot query another table, so this is a trigger. It says the
-- same thing the three dropped checks said, except that it says it about
-- whatever kinds exist rather than about five names.
-- ---------------------------------------------------------------------------

create or replace function portal.document_matches_its_kind()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  t portal.document_types%rowtype;
begin
  select * into t from portal.document_types where key = new.kind_key;

  if not found then
    raise exception 'There is no document kind called "%".', new.kind_key
      using errcode = 'foreign_key_violation';
  end if;

  if not t.is_active then
    raise exception '% is no longer a kind of document that can be filed.', t.label
      using errcode = 'check_violation';
  end if;

  if t.belongs_to = 'staff' and new.staff_id is null then
    raise exception '% belongs to a person, so it needs one.', t.label
      using errcode = 'check_violation';
  end if;

  if t.belongs_to = 'client' and new.client_id is null then
    raise exception '% belongs to a client, so it needs one.', t.label
      using errcode = 'check_violation';
  end if;

  if t.needs_period and (new.period_start is null or new.period_end is null) then
    raise exception '% covers a period, so it needs a start and an end.', t.label
      using errcode = 'check_violation';
  end if;

  if t.needs_amount and new.amount is null then
    raise exception '% carries an amount, so it needs one.', t.label
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

create trigger documents_match_their_kind
  before insert or update on portal.documents
  for each row execute function portal.document_matches_its_kind();

comment on function portal.document_matches_its_kind() is
  'Enforces what each kind of document needs, read from that kind''s own row. Replaces three check constraints that named five kinds by hand.';

-- ---------------------------------------------------------------------------
-- Everybody can read the list; only an admin changes it.
--
-- Readable by any signed-in person because the tracker draws labels from it —
-- a client looking at their own invoice needs the word "Invoice", and hiding
-- the list would mean the label had to be hard-coded in the page, which is
-- the thing this migration exists to stop.
-- ---------------------------------------------------------------------------

alter table portal.document_types enable row level security;

create policy document_types_read on portal.document_types
  for select using (auth.uid() is not null);

create policy document_types_write on portal.document_types
  for all
  using (portal.is_admin())
  with check (portal.is_admin());

grant select on portal.document_types to authenticated;
grant insert, update, delete on portal.document_types to authenticated;
