-- ===========================================================================
-- Sending a message and its files as one act.
--
-- ---------------------------------------------------------------------------
-- **Why this exists at all.**
--
-- A picture sent with no caption is a message with an empty body, allowed only
-- because an attachment row follows it. Those two inserts have to be in one
-- transaction, or the deferred check fires between them and refuses the thing
-- it was written to permit.
--
-- The Supabase client cannot do that. Every `.insert()` is its own transaction,
-- so from the browser there is no way to say "these two together". This
-- function is the smallest thing that can.
--
-- ---------------------------------------------------------------------------
-- **Deliberately NOT `security definer`.**
--
-- Everything in it runs as the caller, so every policy still applies: the
-- insert on `chat_messages` refuses a conversation you are not in and an
-- author that is not you, and the insert on `chat_attachments` refuses a
-- message you cannot see. This function makes the two inserts atomic; it grants
-- nothing.
--
-- A `security definer` version would have been one word shorter and would have
-- handed anybody who can call it the ability to write into any conversation in
-- the company.
--
-- ---------------------------------------------------------------------------
-- **The author is worked out here, not passed in.**
--
-- The caller says what to write, never who wrote it. The policy would refuse a
-- forged author anyway — this just means the application never has occasion to
-- send one.
-- ===========================================================================

create or replace function portal.send_chat_message(
  p_conversation_id uuid,
  p_body text,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
set search_path = portal, public
as $fn$
declare
  v_staff uuid := portal.current_staff_id();
  v_client_user uuid := portal.current_client_user_id();
  v_name text;
  v_message uuid;
begin
  if v_staff is null and v_client_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;

  /*
    The author's name, written into the message rather than joined on read.

    Same reason as everywhere else in this schema: a message is a record of
    something somebody said, and it must still say who once their row is gone.
  */
  select coalesce(s.full_name, cu.full_name)
    into v_name
  from (select 1) x
  left join portal.staff s on s.id = v_staff
  left join portal.client_users cu on cu.id = v_client_user;

  insert into portal.chat_messages
    (conversation_id, author_staff_id, author_client_user_id, author_name, body)
  values
    (p_conversation_id, v_staff, v_client_user, v_name, coalesce(p_body, ''))
  returning id into v_message;

  insert into portal.chat_attachments
    (message_id, filename, storage_key, mime_type, size_bytes, width, height)
  select
    v_message,
    a.filename,
    a.storage_key,
    a.mime_type,
    a.size_bytes,
    a.width,
    a.height
  from jsonb_to_recordset(coalesce(p_attachments, '[]'::jsonb)) as a (
    filename text,
    storage_key text,
    mime_type text,
    size_bytes bigint,
    width integer,
    height integer
  );

  /*
    Read your own message as read.

    Not a separate round trip from the application: it was one before, and a
    message that failed to mark the thread read left the sender with an unread
    badge for something they had just written.
  */
  update portal.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and (
      (staff_id is not null and staff_id = v_staff)
      or (client_user_id is not null and client_user_id = v_client_user)
    );

  return v_message;
end;
$fn$;

comment on function portal.send_chat_message(uuid, text, jsonb) is
  'Writes a message and its attachments in one transaction, as the caller. Exists because the deferred empty-message check needs both inserts to commit together, and the Supabase client cannot group them.';

grant execute on function portal.send_chat_message(uuid, text, jsonb) to authenticated;
