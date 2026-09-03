-- ===========================================================================
-- Sending a reply.
--
-- `send_chat_message` gained one argument. It is a new overload rather than an
-- edit, so the old three-argument form is dropped: two functions of the same
-- name with all-default arguments are ambiguous to PostgREST, which resolves an
-- RPC by the argument names it was given — and the failure arrives as an error
-- about the schema cache, nowhere near the cause.
--
-- Everything else is unchanged, including the two things that matter: it is not
-- `security definer`, so every policy still applies; and the message and its
-- attachments still commit together, which is what lets a picture be sent with
-- no caption.
-- ===========================================================================

drop function if exists portal.send_chat_message(uuid, text, jsonb);

create or replace function portal.send_chat_message(
  p_conversation_id uuid,
  p_body text,
  p_attachments jsonb default '[]'::jsonb,
  p_reply_to_id uuid default null
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
  v_reply uuid;
begin
  if v_staff is null and v_client_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(s.full_name, cu.full_name)
    into v_name
  from (select 1) x
  left join portal.staff s on s.id = v_staff
  left join portal.client_users cu on cu.id = v_client_user;

  /*
    A reply may only point at a message in the same conversation.

    Read through the policy first, so a message the sender cannot see cannot be
    quoted — otherwise a reply would be a way to pull a line out of somebody
    else's thread and show it in this one. Silently dropped rather than
    refused: the message itself is what matters, and losing the quote is a much
    smaller thing than losing what somebody wrote.
  */
  if p_reply_to_id is not null then
    select id into v_reply
    from portal.chat_messages
    where id = p_reply_to_id and conversation_id = p_conversation_id;
  end if;

  insert into portal.chat_messages
    (conversation_id, author_staff_id, author_client_user_id, author_name, body, reply_to_id)
  values
    (p_conversation_id, v_staff, v_client_user, v_name, coalesce(p_body, ''), v_reply)
  returning id into v_message;

  insert into portal.chat_attachments
    (message_id, filename, storage_key, mime_type, size_bytes, width, height)
  select
    v_message, a.filename, a.storage_key, a.mime_type, a.size_bytes, a.width, a.height
  from jsonb_to_recordset(coalesce(p_attachments, '[]'::jsonb)) as a (
    filename text,
    storage_key text,
    mime_type text,
    size_bytes bigint,
    width integer,
    height integer
  );

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

comment on function portal.send_chat_message(uuid, text, jsonb, uuid) is
  'Writes a message, its attachments and its reply link in one transaction, as the caller. A quoted message it cannot see is dropped rather than trusted.';

grant execute on function portal.send_chat_message(uuid, text, jsonb, uuid) to authenticated;
