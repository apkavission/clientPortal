-- ===========================================================================
-- Documents: offer letters, salary slips, invoices, and things people sign.
--
-- ---------------------------------------------------------------------------
-- **Why these are one table and not four.**
--
-- They were asked for separately and they read as four features, but they are
-- the same noun: a piece of paper that belongs to somebody, was issued on a
-- date, sometimes carries an amount, and sometimes needs signing. Four tables
-- would be four sets of policies to get right, and the policies are the part
-- that must not be got wrong — a salary slip is the most private row in this
-- database.
--
-- What genuinely differs between them is *who may see one*, and that is a
-- function of the owner columns, not of the kind. So the kind is a label and
-- the owner is the structure.
--
-- ---------------------------------------------------------------------------
-- **The privacy rule, which is not the one used elsewhere in this schema.**
--
-- `portal.payments` is readable by `is_staff()` — any employee may see any
-- payment, which is fine for money coming in from clients.
--
-- That rule applied here would let every developer read every other
-- developer's salary. So documents are private to their owner, and only an
-- admin sees everything. This is deliberately stricter than its neighbours and
-- must stay that way.
-- ===========================================================================

create type portal.document_kind as enum (
  'offer_letter',
  'salary_slip',
  'invoice',
  'contract',
  'other'
);

create table portal.documents (
  id uuid primary key default gen_random_uuid(),
  kind portal.document_kind not null,
  title text not null,

  /* Whose it is. Exactly one of these, enforced below: a document with two
     owners has no answer to "may this person read it", and one with none is
     invisible to everybody including the person it is about. */
  staff_id uuid references portal.staff (id) on delete cascade,
  client_id uuid references portal.clients (id) on delete cascade,

  /* What it is about, when that is a project. An invoice is nearly always for
     one; an offer letter never is. */
  project_id uuid references portal.client_projects (id) on delete set null,

  /*
    The payment this document evidences.

    The owner asked that a salary slip be generated *when the payment is made,
    with proof* — so the slip points at the payment rather than copying its
    amount and reference. A copy would be a second number that can disagree
    with the first, and the one people would trust is the wrong one.
  */
  payment_id uuid references portal.payments (id) on delete set null,

  amount numeric(12, 2),

  /* What period a salary slip covers. Null for everything else. */
  period_start date,
  period_end date,

  issued_on date not null default current_date,

  /* The file, when there is one: a PDF somebody uploaded, or one this system
     produced and stored. Null when the document is generated on the fly from
     the row itself, which is how a salary slip starts life. */
  storage_key text,
  filename text,
  mime_type text,

  /* Whether it is waiting on signatures. Not "is it signed" — that is derived
     from `document_signatures`, and storing both invites them to disagree. */
  needs_signature boolean not null default false,

  note text,

  created_by uuid references portal.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Exactly one owner.
  constraint documents_one_owner check (
    (staff_id is not null) <> (client_id is not null)
  ),

  -- A salary slip is about a person and a month. Without both it is not a
  -- salary slip, and the screen that lists them by month would drop it.
  constraint documents_salary_slip_is_complete check (
    kind <> 'salary_slip'
    or (staff_id is not null and period_start is not null and period_end is not null)
  ),

  -- An invoice is money owed by a client. An invoice with no amount is a
  -- letter.
  constraint documents_invoice_is_complete check (
    kind <> 'invoice' or (client_id is not null and amount is not null)
  ),

  -- An offer letter is made to a person.
  constraint documents_offer_letter_is_to_a_person check (
    kind <> 'offer_letter' or staff_id is not null
  ),

  constraint documents_period_is_in_order check (
    period_start is null or period_end is null or period_start <= period_end
  )
);

comment on table portal.documents is
  'Offer letters, salary slips, invoices and contracts. One table because they are one noun; private to their owner because one of them is a salary.';

create index documents_staff_idx on portal.documents (staff_id, issued_on desc);
create index documents_client_idx on portal.documents (client_id, issued_on desc);
create index documents_project_idx on portal.documents (project_id);

/*
  One salary slip per person per period.

  Generated on payment, and a payment can be recorded twice by two people who
  both thought it had not been done — which would otherwise give somebody two
  slips for March and a support conversation about which is real.
*/
create unique index documents_one_slip_per_period
  on portal.documents (staff_id, period_start, period_end)
  where kind = 'salary_slip';

create trigger documents_updated_at
  before update on portal.documents
  for each row execute function portal.set_updated_at();

-- ---------------------------------------------------------------------------
-- Signatures.
--
-- The owner asked for two on a contract: Apka Vission's, and the client's,
-- with the client signing from the tracker. So a signature is a row per party
-- rather than two columns on the document — a third party (a co-signer, a
-- witness) then costs nothing, and "who has signed" is a count rather than two
-- nullable timestamps that can both be set to the same person.
-- ---------------------------------------------------------------------------

create table portal.document_signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references portal.documents (id) on delete cascade,

  /* In what capacity. 'company' is Apka Vission signing its own document;
     'client' is the other side. Kept as text against a check rather than an
     enum because the list is short and about roles in one transaction. */
  party text not null check (party in ('company', 'client')),

  /* Who actually signed, so a signature is attributable to a person and not
     only to a side. */
  staff_id uuid references portal.staff (id) on delete set null,
  client_user_id uuid references portal.client_users (id) on delete set null,

  /*
    The name as typed, kept even though the signer is referenced above.

    Same reason a chat message carries its author's name: this is a record of
    something somebody did, and it must still say who when their row is gone.
  */
  signed_name text not null,

  /* The drawn signature, as an image. Null when they typed their name only. */
  signature_image text,

  signed_at timestamptz not null default now(),

  constraint signatures_have_a_signer check (
    staff_id is not null or client_user_id is not null
  )
);

comment on table portal.document_signatures is
  'Who signed a document, in what capacity, and under what name. A row per party rather than columns on the document, so who has signed is a count.';

-- Each side signs once. Signing twice is a mistake, not a second signature.
create unique index document_signatures_one_per_party
  on portal.document_signatures (document_id, party);

create index document_signatures_document_idx
  on portal.document_signatures (document_id);

-- ===========================================================================
-- Who may see what.
-- ===========================================================================

alter table portal.documents enable row level security;
alter table portal.document_signatures enable row level security;

/*
  Reading.

  An admin sees everything, because somebody has to be able to. Everybody else
  sees only what is theirs: their own slips and letters if they are staff, their
  own company's invoices and contracts if they are a client.

  Note what is *not* here: no `is_staff()`. A developer is staff and must not
  see a colleague's salary slip, which is exactly the mistake the neighbouring
  `payments` policy would have made if it had been copied.
*/
create policy documents_read on portal.documents
  for select
  using (
    portal.is_admin()
    or (staff_id is not null and staff_id = portal.current_staff_id())
    or (
      client_id is not null
      and client_id in (
        select cu.client_id
        from portal.client_users cu
        where cu.auth_user_id = auth.uid()
          and cu.is_active
      )
    )
  );

/* Writing is an admin's job. A salary slip somebody can write themselves is
   not evidence of anything. */
create policy documents_write on portal.documents
  for all
  using (portal.is_admin())
  with check (portal.is_admin());

/*
  Signatures are visible to anybody who can see the document.

  Written as a lookup against `documents` rather than repeating the ownership
  rule, so the two cannot drift apart. The subquery is itself subject to the
  read policy above, which is the point.
*/
create policy document_signatures_read on portal.document_signatures
  for select
  using (
    document_id in (select id from portal.documents)
  );

/*
  Signing.

  You may add a signature to a document you can see, and only as yourself: the
  signer columns must match who you actually are. A client signing as the
  company, or one person signing for another, is refused by the database rather
  than by whichever screen happens to be in front of them.
*/
create policy document_signatures_sign on portal.document_signatures
  for insert
  with check (
    document_id in (select id from portal.documents)
    and (
      (
        party = 'company'
        and staff_id is not null
        and staff_id = portal.current_staff_id()
        and client_user_id is null
      )
      or (
        party = 'client'
        and client_user_id is not null
        and client_user_id = portal.current_client_user_id()
        and staff_id is null
      )
    )
  );

/*
  A signature cannot be edited or withdrawn — there is no update or delete
  policy, so both are refused for everybody including an admin.

  This is the whole value of the table. A signature that can be quietly altered
  afterwards evidences nothing, and "the admin could have changed it" is enough
  to make it worthless in the one conversation it exists for. A document signed
  in error is superseded by a new document.
*/

grant select, insert, update, delete on portal.documents to authenticated;
grant select, insert on portal.document_signatures to authenticated;

-- ===========================================================================
-- Birthdays and work anniversaries.
--
-- Two dates on the people who already exist, rather than a table: there is
-- exactly one of each per person, and a row that can only ever have one child
-- is a column.
-- ===========================================================================

alter table portal.staff
  add column date_of_birth date,
  add column joined_on date;

comment on column portal.staff.date_of_birth is
  'For the birthday list. Nullable: nobody is required to give it.';
comment on column portal.staff.joined_on is
  'For work anniversaries, and for how long somebody has been here.';
