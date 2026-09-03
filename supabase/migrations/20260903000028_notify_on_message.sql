-- ===========================================================================
-- A message notifies the rest of the thread, in the database.
--
-- ---------------------------------------------------------------------------
-- **Why this could not stay in the application.**
--
-- The tracker wrote the notifications itself, straight after inserting the
-- message. Every one of them was silently refused, and the first run proved
-- it: two messages in the thread, **zero notifications**, no error anywhere.
--
-- The policy on `portal.notifications` allows a row only when the recipient is
-- the caller — which is right, and exactly wrong for this. Notifying somebody
-- else means writing a row that is not yours, and a policy that permitted that
-- would let anybody post anything into anybody's bell.
--
-- ---------------------------------------------------------------------------
-- **A trigger, not a `security definer` helper the app calls.**
--
-- Both would work. The trigger is chosen because a notification is a
-- *consequence of a message existing*, not a second thing somebody has to
-- remember to do — and "remember to do" is precisely how the first version
-- failed. Any future path that inserts a message, including a repair script,
-- gets the notifications too.
--
-- The author is excluded. Being told about your own message is noise, and
-- noise is what teaches somebody to stop looking at the bell.
-- ===========================================================================

create or replace function portal.notify_conversation()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  preview text;
begin
  /* A nudge towards the conversation, not a copy of it. A long message pasted
     into a list makes every other notification in it unreadable. */
  preview := case
    when length(new.body) > 120 then left(new.body, 117) || '…'
    else new.body
  end;

  insert into portal.notifications (staff_id, client_user_id, kind, title, body, link)
  select
    m.staff_id,
    m.client_user_id,
    'chat.message',
    new.author_name || ' wrote',
    preview,
    '/chat/' || new.conversation_id
  from portal.conversation_members m
  where m.conversation_id = new.conversation_id
    -- Everybody but whoever wrote it.
    and (m.staff_id is null or m.staff_id is distinct from new.author_staff_id)
    and (
      m.client_user_id is null
      or m.client_user_id is distinct from new.author_client_user_id
    );

  return new;
end;
$fn$;

drop trigger if exists chat_messages_notify on portal.chat_messages;
create trigger chat_messages_notify
  after insert on portal.chat_messages
  for each row execute function portal.notify_conversation();

comment on function portal.notify_conversation() is
  'Tells the rest of a thread that somebody wrote. A trigger rather than application code: the first version was written in the tracker and every insert was refused by the recipient-is-you policy, silently.';

-- ---------------------------------------------------------------------------
-- The thread moves to the top of the list when somebody speaks.
--
-- `conversations.updated_at` is what the list is ordered by, and inserting a
-- message does not touch the conversation row — so without this the order was
-- "whenever somebody last edited the title", which is never.
-- ---------------------------------------------------------------------------

create or replace function portal.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $fn$
begin
  update portal.conversations
  set updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$fn$;

drop trigger if exists chat_messages_touch on portal.chat_messages;
create trigger chat_messages_touch
  after insert on portal.chat_messages
  for each row execute function portal.touch_conversation();
