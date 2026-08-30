-- ===========================================================================
-- What was quoted, what was knocked off, what has been paid, and what is left.
-- Plus the approval that turns a quote into a job.
--
-- The owner’s description of the flow, 2026-08-30:
--
--   > project add karna ya edit, client ne kya-kya bola aur kya-kya karna hai,
--   > kitna paisa diya, kitna baki, kitna off kiya, kitne time me hoga — ye sab
--   > PDF me download hoga, client ko bhejenge. Client OK karega to portal me
--   > approved denge, tab pucha jayega developer kaun hai, client pehle se hoga,
--   > aur dono ke email pe task tracker ka link, email aur password jayega.
--
-- Two things follow from that, and this migration is both of them.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Money.
--
-- **Nothing here stores "how much is left".** Three of the four numbers on the
-- screen are derived:
--
--     total       = quoted_amount - discount_amount
--     paid        = sum of payments
--     outstanding = total - paid
--
-- Only the quote, the discount and the individual payments are typed, because
-- each of those is a fact somebody decided. "Outstanding" is arithmetic, and a
-- figure that is typed drifts from the payments it is supposed to summarise —
-- and a client who catches one wrong number stops believing every other number
-- on the document.
--
-- `contract_value` already existed and is renamed in meaning rather than
-- dropped: it is the quote before any discount.
-- ---------------------------------------------------------------------------

alter table portal.client_projects
  add column if not exists discount_amount numeric(12,2) not null default 0
    check (discount_amount >= 0),
  add column if not exists estimated_weeks integer
    check (estimated_weeks is null or estimated_weeks > 0),
  add column if not exists client_brief text,
  add column if not exists what_we_will_do text;

comment on column portal.client_projects.contract_value is
  'The quoted amount, before any discount.';
comment on column portal.client_projects.discount_amount is
  'What was knocked off the quote. Stored so the document can show it as a line rather than as a smaller total nobody can explain.';
comment on column portal.client_projects.estimated_weeks is
  'How long the work is expected to take, in weeks. Goes on the document.';
comment on column portal.client_projects.client_brief is
  'What the client asked for, in their words as far as possible.';
comment on column portal.client_projects.what_we_will_do is
  'What we are going to build, in ours. The two are separate on purpose: the difference between them is where every misunderstanding starts.';

create table if not exists portal.payments (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references portal.client_projects(id) on delete cascade,

  amount        numeric(12,2) not null check (amount > 0),
  paid_on       date not null default current_date,

  -- How it arrived. Free text would become six spellings of "UPI" inside a
  -- month, and then nobody can total by method.
  method        text not null default 'bank'
                  check (method in ('bank','upi','cash','cheque','card','other')),
  reference     text,
  note          text,

  recorded_by   uuid references portal.staff(id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table portal.payments is
  'Individual receipts. What has been paid is the sum of these and is never stored as a column.';

create index if not exists payments_project_idx on portal.payments (project_id, paid_on);

-- ---------------------------------------------------------------------------
-- 2. Approval, and what it starts.
--
-- A project is a quote until the client says yes. `approved_at` is what marks
-- the moment, and it is deliberately a timestamp rather than a boolean: "is it
-- approved" and "when did they approve it" are the same question, and a boolean
-- can only answer half of it.
--
-- `accounts_created_at` records that the two logins have been made and the two
-- emails sent. Also a timestamp, and for a sharper reason: it is the guard
-- against doing it twice. Sending a client a second set of credentials — and
-- silently resetting the password they had already changed — is the kind of
-- mistake that is only noticed by the person locked out.
-- ---------------------------------------------------------------------------

alter table portal.client_projects
  add column if not exists approved_at         timestamptz,
  add column if not exists approved_note       text,
  add column if not exists lead_developer_id   uuid references portal.staff(id) on delete set null,
  add column if not exists accounts_created_at timestamptz;

comment on column portal.client_projects.approved_at is
  'When the client accepted the quote. Null means this is still a proposal.';
comment on column portal.client_projects.lead_developer_id is
  'Chosen at the moment of approval. The person whose task tracker account is created and emailed.';
comment on column portal.client_projects.accounts_created_at is
  'When the task tracker logins were created and sent. Non-null blocks doing it a second time — a repeat would reset a password the person may already have changed.';

-- A project cannot claim to have handed out accounts before it was approved.
alter table portal.client_projects drop constraint if exists projects_accounts_follow_approval;
alter table portal.client_projects
  add constraint projects_accounts_follow_approval check (
    accounts_created_at is null or approved_at is not null
  );

-- ---------------------------------------------------------------------------
-- Grants for the new table, and the policy.
--
-- Repeated per table because `grant on all tables` only covers what existed at
-- the time — the lesson from migration 6, applied rather than re-learned. The
-- default privileges set there cover this automatically, and this is belt and
-- braces for a database where those were run in a different order.
-- ---------------------------------------------------------------------------

alter table portal.payments enable row level security;

drop policy if exists payments_staff_all on portal.payments;
create policy payments_staff_all on portal.payments
  for all using (portal.is_staff()) with check (portal.is_staff());

grant select, insert, update, delete on portal.payments to authenticated;
grant all on portal.payments to service_role;
