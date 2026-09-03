-- ===========================================================================
-- The "is this yours" guards, made null-safe.
--
-- ---------------------------------------------------------------------------
-- **The bug, exactly.**
--
-- `edit_chat_message` and `delete_chat_message` asked:
--
--     if not (
--       (me_staff  is not null and m.author_staff_id       = me_staff)
--       or (me_client is not null and m.author_client_user_id = me_client)
--     ) then raise ...
--
-- For a member of staff editing somebody else's message, that should be
-- `not (false or false)` = true, and it raises.
--
-- It did not. `portal.current_client_user_id()` returned a row for that person
-- — see below — so `me_client` was *not* null, and `m.author_client_user_id`
-- was null because a staff member wrote the message. `null = 'ac95…'` is NULL,
-- not false. So the expression became:
--
--     not (false or (true and NULL))  ->  not NULL  ->  NULL
--
-- and `if NULL then` does not fire. The guard fell through in silence and one
-- person edited another person's message.
--
-- This is the ordinary shape of a three-valued-logic mistake: it does not
-- misbehave in testing, because it only goes wrong when one side is null, and
-- the null case is the one nobody writes a test for. `is not distinct from`
-- never returns NULL and is what these should have used from the start.
--
-- ---------------------------------------------------------------------------
-- **Why `me_client` was not null for a member of staff.**
--
-- One auth account is on both lists: a row in `portal.staff` and a row in
-- `portal.client_users`, with the same `auth_user_id`. So both helpers answer
-- for them, and every policy written as "staff or client" treats one person as
-- two.
--
-- That is a data problem rather than a schema one, and it is not fixed here —
-- deciding which side an account belongs on is the owner's call, not a
-- migration's. `npm run check:privileges` in the company admin now reports it.
-- What this migration does is make the code correct whether or not that ever
-- happens again.
-- ===========================================================================

create or replace function portal.edit_chat_message(p_message_id uuid, p_body text)
returns void
language plpgsql
set search_path = portal, public
as $fn$
declare
  me_staff uuid := portal.current_staff_id();
  me_client uuid := portal.current_client_user_id();
  m portal.chat_messages%rowtype;
  is_mine boolean;
begin
  select * into m from portal.chat_messages where id = p_message_id;

  if not found then
    raise exception 'That message is no longer there.' using errcode = 'P0002';
  end if;

  /* `is not distinct from` rather than `=`: it is false when one side is null
     instead of NULL, so the guard below is a real boolean. */
  is_mine :=
    (me_staff is not null and m.author_staff_id is not distinct from me_staff)
    or (me_client is not null and m.author_client_user_id is not distinct from me_client);

  if not is_mine then
    raise exception 'You can only edit your own messages.' using errcode = '42501';
  end if;

  if m.deleted_at is not null then
    raise exception 'That message was deleted.' using errcode = 'check_violation';
  end if;

  if portal.message_is_read(p_message_id) then
    raise exception 'That message has already been read, so it cannot be changed.'
      using errcode = 'check_violation';
  end if;

  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'A message cannot be emptied. Delete it instead.'
      using errcode = 'check_violation';
  end if;

  update portal.chat_messages
  set body = p_body, edited_at = now()
  where id = p_message_id;
end;
$fn$;

create or replace function portal.delete_chat_message(p_message_id uuid)
returns void
language plpgsql
set search_path = portal, public
as $fn$
declare
  me_staff uuid := portal.current_staff_id();
  me_client uuid := portal.current_client_user_id();
  m portal.chat_messages%rowtype;
  is_mine boolean;
begin
  select * into m from portal.chat_messages where id = p_message_id;

  if not found then
    raise exception 'That message is no longer there.' using errcode = 'P0002';
  end if;

  is_mine :=
    (me_staff is not null and m.author_staff_id is not distinct from me_staff)
    or (me_client is not null and m.author_client_user_id is not distinct from me_client);

  if not is_mine then
    raise exception 'You can only delete your own messages.' using errcode = '42501';
  end if;

  if m.deleted_at is not null then
    return;
  end if;

  if portal.message_is_read(p_message_id) then
    raise exception 'That message has already been read, so it cannot be deleted.'
      using errcode = 'check_violation';
  end if;

  /* Blanked, not removed. The row stays so the thread does not lose a message
     out of its middle with no trace; the attachments go, because leaving the
     picture behind after deleting the message is not deleting it. */
  delete from portal.chat_attachments where message_id = p_message_id;

  update portal.chat_messages
  set body = '', deleted_at = now()
  where id = p_message_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- The same mistake, in the read check.
--
-- `message_is_read` used `is distinct from`, which is already null-safe — but
-- it compared a member row to the author on *both* columns with an `or`, so an
-- account that is both staff and a client satisfied the second half against a
-- null author and counted as "somebody else". Anchoring on the member's own
-- kind fixes it.
-- ---------------------------------------------------------------------------

create or replace function portal.message_is_read(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = portal, public
as $fn$
  select exists (
    select 1
    from portal.chat_messages m
    join portal.conversation_members mem
      on mem.conversation_id = m.conversation_id
    where m.id = p_message_id
      and mem.last_read_at is not null
      and mem.last_read_at >= m.created_at
      and not (
        /* The author's own membership row, whichever kind they are. Reading
           your own message back is not somebody having received it. */
        (mem.staff_id is not null and mem.staff_id is not distinct from m.author_staff_id)
        or (
          mem.client_user_id is not null
          and mem.client_user_id is not distinct from m.author_client_user_id
        )
      )
  );
$fn$;

create or replace function portal.message_read_by(p_message_id uuid)
returns table (person text, read_at timestamptz, has_read boolean)
language sql
stable
security definer
set search_path = portal, public
as $fn$
  select
    coalesce(s.full_name, cu.full_name, 'Somebody'),
    mem.last_read_at,
    mem.last_read_at is not null and mem.last_read_at >= m.created_at
  from portal.chat_messages m
  join portal.conversation_members mem
    on mem.conversation_id = m.conversation_id
  left join portal.staff s on s.id = mem.staff_id
  left join portal.client_users cu on cu.id = mem.client_user_id
  where m.id = p_message_id
    and not (
      (mem.staff_id is not null and mem.staff_id is not distinct from m.author_staff_id)
      or (
        mem.client_user_id is not null
        and mem.client_user_id is not distinct from m.author_client_user_id
      )
    )
    and portal.in_conversation(m.conversation_id)
  order by 1;
$fn$;
