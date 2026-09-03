-- ===========================================================================
-- Pictures, screenshots and video in chat.
--
-- ---------------------------------------------------------------------------
-- **A table, not a jsonb column.**
--
-- `task_comments` keeps its attachments in jsonb, and copying that here would
-- have been the quicker change. It is the wrong one, because of how these are
-- downloaded.
--
-- A private file is fetched through a route that asks the database, *as the
-- person clicking*, whether they may have it — and only then signs a short-
-- lived URL. That question needs an addressable row with a policy on it. An
-- element inside a jsonb array has neither, so the route would have to re-derive
-- the rule itself: a second copy of "may this person see this", in TypeScript,
-- next to the one in SQL, free to drift.
--
-- The owner's requirement was that nobody may reach anybody else's URL. That is
-- a promise about the download path, so the download path is what this is shaped
-- around.
--
-- ---------------------------------------------------------------------------
-- **A message may now be empty, but only if it carries something.**
--
-- `body` was `not null` with a non-empty check, which is right for text and
-- refuses a screenshot sent with no caption — the commonest way anybody sends
-- one. The check is replaced by a deferred constraint trigger, because the
-- attachment rows land after the message and an immediate check would see a
-- message that is momentarily empty and refuse it.
-- ===========================================================================

create table portal.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null
    references portal.chat_messages (id) on delete cascade,

  filename text not null,

  /* Where it actually is, in the private bucket. Never exposed to a browser —
     the download route reads it server-side and signs a URL for a minute. */
  storage_key text not null unique,

  mime_type text,
  size_bytes bigint,

  /*
    Pixel size, for images and video.

    Kept so the thread can reserve the right space before the picture arrives.
    Without it every image lands and shoves the conversation down the screen,
    which is at its worst on a phone and exactly when somebody is reading.
  */
  width integer,
  height integer,

  created_at timestamptz not null default now()
);

comment on table portal.chat_attachments is
  'Files sent in chat. A table rather than jsonb so each one is an addressable row with a policy, which is what the download route asks.';

create index chat_attachments_message_idx on portal.chat_attachments (message_id);

-- ---------------------------------------------------------------------------
-- A message must say something or carry something.
-- ---------------------------------------------------------------------------

alter table portal.chat_messages drop constraint chat_messages_body_check;

comment on column portal.chat_messages.body is
  'The text. May be empty when the message carries an attachment — see chat_messages_not_empty.';

create or replace function portal.chat_message_is_not_empty()
returns trigger
language plpgsql
as $fn$
begin
  if length(btrim(coalesce(new.body, ''))) > 0 then
    return new;
  end if;

  if exists (select 1 from portal.chat_attachments a where a.message_id = new.id) then
    return new;
  end if;

  raise exception 'A message needs some text or something attached.'
    using errcode = 'check_violation';
end;
$fn$;

/*
  Deferred to the end of the transaction.

  The message is inserted first and its attachments immediately after, in one
  transaction. Checked immediately, this would fire between the two and refuse
  every picture sent without a caption — the exact case it exists to allow.
*/
create constraint trigger chat_messages_not_empty
  after insert or update on portal.chat_messages
  deferrable initially deferred
  for each row execute function portal.chat_message_is_not_empty();

-- ===========================================================================
-- Who may see an attachment: whoever is in the conversation. Nobody else.
-- ===========================================================================

alter table portal.chat_attachments enable row level security;

/*
  Reading.

  Expressed by looking the message up through `chat_messages`, which is itself
  behind the membership policy — so this cannot say anything different from
  "you can see the message it belongs to", however that rule changes later.
*/
create policy chat_attachments_read on portal.chat_attachments
  for select
  using (
    message_id in (select id from portal.chat_messages)
  );

/*
  Attaching.

  Only to a message you can see, which by the policy above means one in a
  conversation you are in. Nothing here checks authorship: a second attachment
  added to your own message a moment later is the same act, and the message
  itself already refused a forged author.
*/
create policy chat_attachments_write on portal.chat_attachments
  for insert
  with check (
    message_id in (select id from portal.chat_messages)
  );

/*
  No update and no delete policy, so both are refused for everybody.

  A file that can be swapped after the fact under the same row is worse than no
  file: the thread would show one thing and have shown another. Sending the
  right one again is the fix.
*/

grant select, insert on portal.chat_attachments to authenticated;

-- ===========================================================================
-- The bucket.
--
-- Private, like `project-files`. Nothing links to it directly; every download
-- goes through a route that asks the database first and signs a URL that lives
-- for a minute.
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', false)
on conflict (id) do nothing;
