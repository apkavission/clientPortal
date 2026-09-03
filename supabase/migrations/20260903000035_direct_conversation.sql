-- ===========================================================================
-- Opening a one-to-one thread with somebody, or finding the one that exists.
--
-- ---------------------------------------------------------------------------
-- **Why this is a function and not two queries in the application.**
--
-- "Find the direct thread with this person, and make one if there isn't" is a
-- read followed by a write, and two people doing it at the same moment both
-- read "none" and both create one. That is not a rare race: the first thing
-- this is used for is congratulating somebody on their birthday, which is
-- precisely when several people act within the same minute.
--
-- Two threads with the same person is not a crash. It is worse — messages
-- split across two places, each looking complete, and nobody notices until
-- somebody says "I told you that already".
--
-- ---------------------------------------------------------------------------
-- **Not `security definer`.** It runs as the caller, so the insert policies on
-- `conversations` and `conversation_members` still apply, and so does the
-- deferred rule that refuses to put a client and a developer in one thread.
-- This makes the pair of statements atomic; it grants nothing.
-- ===========================================================================

create or replace function portal.direct_conversation(p_other_staff_id uuid)
returns uuid
language plpgsql
set search_path = portal, public
as $fn$
declare
  me uuid := portal.current_staff_id();
  existing uuid;
  fresh uuid;
begin
  if me is null then
    raise exception 'Only staff have direct threads.' using errcode = 'insufficient_privilege';
  end if;

  if p_other_staff_id = me then
    raise exception 'That is you.' using errcode = 'check_violation';
  end if;

  /*
    A direct thread is one with exactly these two people in it.

    The `count = 2` matters: without it, a group thread that happens to contain
    both of them would match, and a private message would land in front of
    everybody else in that group.
  */
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

comment on function portal.direct_conversation(uuid) is
  'The one-to-one thread with somebody, opened if it does not exist. One call because find-then-create races, and two threads with the same person split a conversation in half without anybody noticing.';

grant execute on function portal.direct_conversation(uuid) to authenticated;
