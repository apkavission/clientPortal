-- ===========================================================================
-- What a change costs, and anything else worth recording about it.
--
-- The owner's instruction, 2026-08-31:
--
--   > jo request menu hai portal me ... usme bhi jo amount aur sab kuch dena
--   > aur custom field bhi add karne ka
--
-- ---------------------------------------------------------------------------
-- **`quoted_amount` is a column, not a line in the note.**
--
-- A client request that turns into paid work has a price, and the price is
-- the thing everyone disagrees about later. Writing it into `review_note`
-- would put money in a free-text box: unsummable, unformattable, and
-- impossible to answer "what have the changes on this project cost" without
-- reading every note.
--
-- `numeric(12,2)`, matching `client_projects.contract_value` — money is never
-- a float, and a second precision here would show up as rounding differences
-- between a request and the invoice that follows it.
--
-- Null and zero are different answers and both are real: null is "nobody has
-- priced it", zero is "priced, and we are not charging". A screen that showed
-- both as "₹0" would turn the first into a promise.
--
-- ---------------------------------------------------------------------------
-- **`extra` is for the fields we have not thought of.**
--
-- Deliberately `jsonb` rather than a table of field definitions. A definitions
-- table is the right shape once the same field is wanted on every request, and
-- the wrong shape for what was actually asked for — somewhere to put the one
-- thing this particular request needs recorded. When a key starts appearing on
-- every row it has earned a column, and moving it is a migration this schema
-- can do.
--
-- An object, not an array, and the check enforces it: a list has no field
-- names in it, and reading one back as `{label, value}` pairs is a convention
-- that lasts until somebody writes a bare string into it.
-- ===========================================================================

alter table portal.client_requests
  add column if not exists quoted_amount numeric(12,2)
    check (quoted_amount is null or quoted_amount >= 0);

comment on column portal.client_requests.quoted_amount is
  'What this change was priced at. Null means nobody has priced it; zero means priced and not charged. Same precision as client_projects.contract_value.';

alter table portal.client_requests
  add column if not exists extra jsonb not null default '{}'::jsonb;

alter table portal.client_requests
  drop constraint if exists client_requests_extra_is_object;

alter table portal.client_requests
  add constraint client_requests_extra_is_object
    check (jsonb_typeof(extra) = 'object');

comment on column portal.client_requests.extra is
  'Ad-hoc fields for this one request, as a flat object of label to value. A key that starts appearing on every row has earned a column of its own.';

do $say$
declare
  n integer;
begin
  select count(*) into n from portal.client_requests;
  raise notice 'client_requests now carries quoted_amount and extra. % row(s), all unpriced until somebody prices them.', n;
end
$say$;
