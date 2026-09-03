-- ===========================================================================
-- Last seen, so a message can say whether it actually reached anybody.
--
-- ---------------------------------------------------------------------------
-- **What the three ticks have to mean.**
--
--   one tick    written down here, and the other person has not been online
--               since — so it is waiting for them
--   two ticks   they have been online since it was written, so it reached them
--   two ticks,  they have opened the thread since it was written, so they have
--   coloured    read it
--
-- The middle one is the only one that needed anything new. "Read" comes from
-- `conversation_members.last_read_at`, which already exists. "Delivered" is a
-- statement about the *person*, not about one conversation — they were in the
-- application, on any screen — and there was nowhere to record that.
--
-- ---------------------------------------------------------------------------
-- **Why a column on the person rather than a presence table.**
--
-- The only question anybody asks of this is "have they been online since a
-- given moment". That is one timestamp per person. A table of sessions would
-- answer it with a max() over rows nobody ever reads individually, and would
-- grow forever.
--
-- It is deliberately coarse. This is not "online now" with a green dot — that
-- needs a heartbeat, and a heartbeat is a request every few seconds from every
-- open tab, forever, to decorate a chat list.
-- ===========================================================================

alter table portal.staff add column last_seen_at timestamptz;
alter table portal.client_users add column last_seen_at timestamptz;

comment on column portal.staff.last_seen_at is
  'When this person last loaded a page. Coarse on purpose: it answers "have they been online since X", not "are they online now".';
comment on column portal.client_users.last_seen_at is
  'When this person last loaded a page. See the note on staff.last_seen_at.';

/**
 * Marks the caller as having been here.
 *
 * ---------------------------------------------------------------------------
 * **`security definer`, and that is the point.** Writing to your own row on
 * `portal.staff` otherwise needs an update policy on the staff table — and the
 * one that exists is `is_owner()`, deliberately, because that table holds
 * everybody's role. Opening it up so people can record a timestamp would be
 * handing out the ability to write to the row that decides what they can see.
 *
 * So this function writes it instead, and it can only ever write one column, on
 * one row, belonging to whoever called it.
 *
 * **Throttled to a minute.** It runs on every page load. Without the guard a
 * person clicking through screens writes a row per click, each one a WAL record
 * and an index update, to move a timestamp by two seconds — and the answer this
 * feeds is "have they been online since", which a minute does not change.
 */
create or replace function portal.seen()
returns void
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  me_staff uuid := portal.current_staff_id();
  me_client uuid := portal.current_client_user_id();
begin
  if me_staff is not null then
    update portal.staff
    set last_seen_at = now()
    where id = me_staff
      and (last_seen_at is null or last_seen_at < now() - interval '1 minute');
  end if;

  if me_client is not null then
    update portal.client_users
    set last_seen_at = now()
    where id = me_client
      and (last_seen_at is null or last_seen_at < now() - interval '1 minute');
  end if;
end;
$fn$;

comment on function portal.seen() is
  'Records that the caller was here. Definer because writing to portal.staff otherwise needs a policy that would let people edit the row deciding their own access.';

grant execute on function portal.seen() to authenticated;

/**
 * Has this message reached anybody yet?
 *
 * True when somebody other than the author has been online since it was
 * written. Says nothing about whether they looked at it — that is
 * `message_is_read`, and the two are shown as different ticks.
 */
create or replace function portal.message_is_delivered(p_message_id uuid)
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
    left join portal.staff s on s.id = mem.staff_id
    left join portal.client_users cu on cu.id = mem.client_user_id
    where m.id = p_message_id
      and coalesce(s.last_seen_at, cu.last_seen_at) >= m.created_at
      and not (
        (mem.staff_id is not null and mem.staff_id is not distinct from m.author_staff_id)
        or (
          mem.client_user_id is not null
          and mem.client_user_id is not distinct from m.author_client_user_id
        )
      )
  );
$fn$;

grant execute on function portal.message_is_delivered(uuid) to authenticated;

/**
 * A whole thread's ticks in one call.
 *
 * Per message rather than per call to `message_is_delivered`, because a thread
 * of two hundred messages would otherwise be four hundred function calls to
 * draw one column of ticks.
 */
create or replace function portal.thread_receipts(p_conversation_id uuid)
returns table (message_id uuid, delivered boolean, read boolean)
language sql
stable
security definer
set search_path = portal, public
as $fn$
  with others as (
    select
      mem.staff_id,
      mem.client_user_id,
      mem.last_read_at,
      coalesce(s.last_seen_at, cu.last_seen_at) as last_seen_at
    from portal.conversation_members mem
    left join portal.staff s on s.id = mem.staff_id
    left join portal.client_users cu on cu.id = mem.client_user_id
    where mem.conversation_id = p_conversation_id
  )
  select
    m.id,
    exists (
      select 1 from others o
      where o.last_seen_at >= m.created_at
        and not (
          (o.staff_id is not null and o.staff_id is not distinct from m.author_staff_id)
          or (
            o.client_user_id is not null
            and o.client_user_id is not distinct from m.author_client_user_id
          )
        )
    ),
    exists (
      select 1 from others o
      where o.last_read_at >= m.created_at
        and not (
          (o.staff_id is not null and o.staff_id is not distinct from m.author_staff_id)
          or (
            o.client_user_id is not null
            and o.client_user_id is not distinct from m.author_client_user_id
          )
        )
    )
  from portal.chat_messages m
  where m.conversation_id = p_conversation_id
    /* Only for people in it. Without this, anybody could learn when anybody
       else was last online by asking about a conversation id. */
    and portal.in_conversation(p_conversation_id);
$fn$;

grant execute on function portal.thread_receipts(uuid) to authenticated;
