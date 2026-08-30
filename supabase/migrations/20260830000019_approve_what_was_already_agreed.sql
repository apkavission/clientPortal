-- ===========================================================================
-- The requests that were agreed before there was a word for it.
--
-- Found immediately after `…018_changes_and_conversation.sql` was applied, by
-- looking at the rows rather than at the code:
--
--   title                                          status      approved_at
--   "Can patients cancel their own appointment?"    converted   null
--   "kya"                                           accepted    null
--
-- Both were agreed. One of them **is already a task on the board**. Neither has
-- an `approved_at`, because that column did not exist when they were agreed.
--
-- ---------------------------------------------------------------------------
-- Three things break if this is left alone, and none of them announce
-- themselves.
--
-- **The developer doing the work cannot see the request behind it.** The new
-- select policy hands staff a request only once `approved_at` is set. So the
-- task exists on the board and the reason for it is invisible to the person
-- doing it.
--
-- **Editing either row becomes impossible.** `conversion_needs_approval` fires
-- on update as well as insert, so the next save of a converted request with no
-- approval is refused — with a message about approving something that was
-- approved months ago.
--
-- **The screen tells the client the opposite of the truth**, offering to approve
-- work that has already been built.
--
-- ---------------------------------------------------------------------------
-- Why the constraint has to be loosened, and exactly how far.
--
-- `…018` required approval to be whole: a moment and a person, both or neither.
-- That is right for anything approved from now on. It cannot be met by these
-- rows: the approval genuinely happened, and **who** did it was never recorded,
-- because there was nowhere to record it.
--
-- The choice is between inventing a name and admitting the gap. Inventing one
-- would put a person’s name against a decision they may not have made, in the
-- one table that exists to settle arguments about what was agreed.
--
-- So the constraint becomes the weaker true thing: **a decider implies a
-- moment.** A moment without a decider is allowed, and means "agreed before this
-- was recorded". Every approval made through the application sets both, because
-- the action always has a session to name.
-- ===========================================================================

alter table portal.client_requests drop constraint if exists requests_approval_is_complete;

alter table portal.client_requests
  add constraint requests_approval_is_complete
  check (approved_by is null or approved_at is not null);

comment on column portal.client_requests.approved_by is
  'Who agreed it becomes work. Null only on rows agreed before this column existed — the application always records both.';

-- ---------------------------------------------------------------------------
-- The backfill.
--
-- `accepted` and `converted` are the two statuses that mean somebody said yes.
-- `submitted` and `under_review` are still open questions and are left alone;
-- `declined` was a no and stays one.
--
-- The moment is taken from the row itself rather than from now(), so the record
-- says roughly when it was agreed instead of claiming it all happened during a
-- migration. `reviewed_by` is the person who answered it, which is the closest
-- thing to a decider that was ever written down — where it is null, so is the
-- approver, and the comment above says what that means.
-- ---------------------------------------------------------------------------

update portal.client_requests
set approved_at = coalesce(updated_at, created_at),
    approved_by = reviewed_by
where approved_at is null
  and status in ('accepted', 'converted');

/*
  Nothing is counted as a change.

  `change_number` is deliberately left null on all of them. These were agreed
  before any project had a change allowance, and stamping them as change 1 and
  change 2 would spend rounds a client was never told about — the opposite of
  what the allowance is for.
*/
