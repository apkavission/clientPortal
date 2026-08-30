-- ===========================================================================
-- An approval’s record must outlive the person who gave it.
--
-- **What went wrong.** Two decisions in `20260829000002_portal_projects.sql`
-- contradicted each other, and neither was wrong on its own:
--
--   1. `responded_by uuid references portal.client_users(id) on delete set null`
--      — removing a person should not delete the history they are attached to.
--
--   2. `constraint approvals_answer_is_complete check (
--          status = ’pending’
--          or (responded_at is not null and responded_by is not null))`
--      — "the client approved it" is a claim that needs evidence.
--
-- Put together they mean: deleting a client user nulls `responded_by`, which
-- immediately violates the constraint, which fails the delete. So **a client who
-- had ever approved anything could never be removed** — not when they left the
-- company, not when the project ended, not ever. The delete came back as:
--
--     23514 — new row for relation "approvals" violates check constraint
--             "approvals_answer_is_complete"
--
-- Found on 2026-08-30 while clearing test data, which is the ordinary operation
-- that would have found it in production a year later and at a worse moment.
--
-- **The fix, and why it is this one.** An audit record that points at a row
-- which can vanish is not an audit record. What matters a year from now is *that
-- it was approved, when, and by whom* — and "whom" has to be a name written down
-- at the time, not a link that may resolve to nothing.
--
-- So the identity is captured as text when the answer is given. The uuid stays,
-- as a link to the person’s current row while they still have one, and it is
-- allowed to become null. The constraint now guards the snapshot rather than
-- the link.
--
-- Rejected alternatives, briefly:
--
--   `on delete restrict` — refuses to delete the person at all. That is the same
--   problem with a clearer error message.
--
--   Dropping the constraint — lets a row claim it was approved with nothing
--   behind the claim, which is the thing the constraint exists to stop.
-- ===========================================================================

alter table portal.approvals
  add column if not exists responded_by_name text;

comment on column portal.approvals.responded_by_name is
  'Who answered, written down at the time. Survives the deletion of their account — this is the record, and responded_by is only a link to it while it exists.';

-- Backfill from the rows that still resolve, so existing answers keep their
-- name rather than being left blank by the migration that introduced the column.
update portal.approvals a
set responded_by_name = u.full_name
from portal.client_users u
where a.responded_by = u.id
  and a.responded_by_name is null;

-- Anything answered whose responder has already gone is honest about it rather
-- than being given a made-up name.
update portal.approvals
set responded_by_name = 'Account since removed'
where status <> 'pending'
  and responded_by_name is null;

alter table portal.approvals
  drop constraint if exists approvals_answer_is_complete;

alter table portal.approvals
  add constraint approvals_answer_is_complete check (
    status = 'pending'
    or (responded_at is not null and responded_by_name is not null)
  );

comment on constraint approvals_answer_is_complete on portal.approvals is
  'An answered approval must record when it was answered and the name of who answered. Both are captured at the time, so removing an account cannot erase the record or block the removal.';
