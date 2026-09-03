-- ===========================================================================
-- Proof of payment on a document.
--
-- ---------------------------------------------------------------------------
-- **The gap this closes.**
--
-- The owner asked that a salary slip be produced when somebody is paid, with
-- proof — a screenshot, a reference, cheque or cash.
--
-- `portal.payments` cannot carry that. It is money coming *in*: every row hangs
-- off `project_id`, and a salary has no project. There was nowhere in this
-- database to record that the company had paid one of its own people.
--
-- ---------------------------------------------------------------------------
-- **Why not a `staff_payments` table.**
--
-- It would be a table whose every row has exactly one salary slip, and whose
-- only purpose is to be shown on that slip. A row that can only ever have one
-- child is a column — and worse, two rows means they can disagree about the
-- amount, which is the one number the whole document is about.
--
-- So the slip *is* the record of payment. It already carries the amount, the
-- person and the period; this adds when and how, and the proof goes in the
-- file the document already has room for.
-- ===========================================================================

alter table portal.documents
  add column paid_on date,
  add column paid_method text;

comment on column portal.documents.paid_on is
  'When this was actually paid, for money going out — a salary. Money coming in is a row in `payments`, pointed at by `payment_id`.';

comment on column portal.documents.paid_method is
  'Cash, cheque, a transfer reference. Free text, matching `payments.method`: this is somebody describing what they did, and a fixed list would be wrong within the month.';

comment on column portal.documents.payment_id is
  'The client payment that settled this, for money coming in. Never set together with `paid_on` — see documents_one_kind_of_payment.';

/*
  A document evidences one payment, in one of two ways.

  `payment_id` for money the company received, which is a row somebody already
  entered against a project. `paid_on` for money the company sent, which is not
  a row anywhere else. Both set would mean two answers to "when was this paid",
  and the one people trust would be whichever the screen happened to show.
*/
alter table portal.documents
  add constraint documents_one_kind_of_payment check (
    payment_id is null or paid_on is null
  );

/* Proof is a file, and the column for it already exists. What is worth saying
   is that a slip claiming to be paid with nothing to show is worth less than
   one that admits it — so this is a note on the column, not a constraint. Cash
   handed over has no screenshot, and refusing to record it would push it
   somewhere with no record at all. */
comment on column portal.documents.storage_key is
  'The file: an uploaded PDF, or the proof of payment — a screenshot of the transfer. Nullable on purpose; cash has no screenshot, and refusing the row would push that payment out of the system entirely.';
