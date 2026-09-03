-- ===========================================================================
-- One person is one author.
--
-- ---------------------------------------------------------------------------
-- **The bug.**
--
-- An account that is both a member of staff and a client user — there is one in
-- this database — could not send a chat message at all:
--
--     new row for relation "chat_messages" violates check constraint
--     "chat_messages_one_author"
--
-- `send_chat_message` asked both helpers who the caller was, and both answered.
-- The row then carried an `author_staff_id` *and* an `author_client_user_id`,
-- which the one-author check exists to forbid — rightly, because a message with
-- two authors has no answer to "whose is this" and therefore none to "may you
-- edit it".
--
-- ---------------------------------------------------------------------------
-- **Staff wins, and it is decided here rather than at each call site.**
--
-- Not arbitrary: being staff is the stronger identity. Somebody who works here
-- and also has a client login is an employee who happens to be reachable as a
-- customer — and every rule about internal notes, salary slips and the
-- client/developer separation is safer resolving them to staff. Treating them
-- as a client would let their own colleagues' internal notes reach them through
-- the client half.
--
-- **The underlying data is still wrong** and this does not pretend otherwise.
-- One account on both lists means every "staff or client" rule matches twice,
-- and `npm run check:privileges` reports it. This makes the code behave
-- correctly while that is decided; it is not the fix.
-- ===========================================================================

/**
 * Who the caller is, as exactly one person.
 *
 * Returns a staff id *or* a client-user id, never both. Everything that writes
 * an author, a reactor or a signer should use this rather than asking the two
 * helpers separately.
 */
create or replace function portal.me()
returns table (staff_id uuid, client_user_id uuid)
language sql
stable
security definer
set search_path = portal, public
as $fn$
  select
    portal.current_staff_id(),
    case
      when portal.current_staff_id() is not null then null
      else portal.current_client_user_id()
    end;
$fn$;

comment on function portal.me() is
  'The caller as one person: staff, or a client user, never both. Staff wins — it is the stronger identity, and resolving a dual account the other way would let internal notes reach them through the client half.';

grant execute on function portal.me() to authenticated;

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
  v_staff uuid;
  v_client_user uuid;
  v_name text;
  v_message uuid;
  v_reply uuid;
begin
  /* One person, not two. See portal.me(). */
  select staff_id, client_user_id into v_staff, v_client_user from portal.me();

  if v_staff is null and v_client_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(s.full_name, cu.full_name)
    into v_name
  from (select 1) x
  left join portal.staff s on s.id = v_staff
  left join portal.client_users cu on cu.id = v_client_user;

  /* A reply may only point at a message in the same conversation, and one the
     sender can actually see. Silently dropped rather than refused: losing a
     quote is a much smaller thing than losing what somebody wrote. */
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

grant execute on function portal.send_chat_message(uuid, text, jsonb, uuid) to authenticated;

/*
  The same resolution for opening a direct thread.

  It asked `current_staff_id()` and refused if null — which was already right,
  because a direct thread is between colleagues. This just makes it say so
  through the same helper as everything else.
*/
create or replace function portal.direct_conversation(p_other_staff_id uuid)
returns uuid
language plpgsql
set search_path = portal, public
as $fn$
declare
  me uuid;
  existing uuid;
  fresh uuid;
begin
  select staff_id into me from portal.me();

  if me is null then
    raise exception 'Only staff have direct threads.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_other_staff_id = me then
    raise exception 'That is you.' using errcode = 'check_violation';
  end if;

  /* Exactly these two people. The count matters: without it a group thread
     containing both would match, and a private message would land in front of
     everybody else in that group. */
  select c.id into existing
  from portal.conversations c
  where c.kind = 'direct'
    and (
      select count(*) from portal.conversation_members m
      where m.conversation_id = c.id
    ) = 2
    and exists (
      select 1 from portal.conversation_members m
      where m.conversation_id = c.id and m.staff_id = me
    )
    and exists (
      select 1 from portal.conversation_members m
      where m.conversation_id = c.id and m.staff_id = p_other_staff_id
    )
  limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into portal.conversations (kind, title)
  values ('direct', null)
  returning id into fresh;

  insert into portal.conversation_members (conversation_id, staff_id)
  values (fresh, me), (fresh, p_other_staff_id);

  return fresh;
end;
$fn$;

grant execute on function portal.direct_conversation(uuid) to authenticated;
