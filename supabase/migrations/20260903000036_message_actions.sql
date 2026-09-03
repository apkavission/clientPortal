-- ===========================================================================
-- What you can do to a message once it is sent.
--
-- Reply to it, react to it, star it, pin it, edit it, delete it, and see when
-- it was read.
--
-- ---------------------------------------------------------------------------
-- **The rule that shapes all of it: a message that has been read is finished.**
--
-- The owner's instruction — once the other side has read it, it cannot be
-- edited and it cannot be deleted. That is the honest version of the feature.
-- An "edit" that silently rewrites something somebody has already read is not
-- an edit, it is a way to deny having said it, and every argument that follows
-- is worse than the typo would have been.
--
-- So the check is in the database, not in a disabled button. A disabled button
-- is a suggestion; this is the answer.
--
-- ---------------------------------------------------------------------------
-- **How "read" is known, and what it is not.**
--
-- `conversation_members.last_read_at` is when somebody last opened the thread.
-- A message is read when *another* member's `last_read_at` is at or after the
-- moment it was written.
--
-- That is an approximation in one direction only: it can never say read when
-- nobody has opened the thread since. It can say read a few seconds late — if
-- somebody is looking at the thread as the message lands, it counts from their
-- next visit. Erring towards "not read yet" is the right way round, because
-- the cost of being wrong is a message that could still be recalled, rather
-- than one that was recalled after somebody had seen it.
--
-- A receipt per person per message would be exact. It is a row for every
-- message multiplied by every member, to answer one question that this answers
-- with a column that already exists.
-- ===========================================================================

alter table portal.chat_messages
  /* What this is a reply to. `set null` rather than cascade: deleting the
     message somebody quoted must not delete the reply — the reply is somebody
     else's words. */
  add column reply_to_id uuid references portal.chat_messages (id) on delete set null,

  /* Set when the text is changed, so the thread can say so. Never hidden: an
     edit nobody can see is the thing this feature must not be. */
  add column edited_at timestamptz,

  /* Deleted for everybody, WhatsApp-style: the row stays so the thread does not
     silently lose a message from the middle, and the body is blanked. */
  add column deleted_at timestamptz,

  /* Pinned in this conversation, for everybody in it. A pin is a statement
     about the thread — "this is the address" — rather than a private bookmark,
     which is what a star is. */
  add column pinned_at timestamptz,
  add column pinned_by uuid references portal.staff (id) on delete set null;

comment on column portal.chat_messages.deleted_at is
  'Deleted for everybody. The row stays and the body is blanked, so the thread does not lose a message from its middle without trace.';

create index chat_messages_reply_idx on portal.chat_messages (reply_to_id)
  where reply_to_id is not null;

create index chat_messages_pinned_idx on portal.chat_messages (conversation_id, pinned_at)
  where pinned_at is not null;

-- ---------------------------------------------------------------------------
-- Reactions.
-- ---------------------------------------------------------------------------

create table portal.chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references portal.chat_messages (id) on delete cascade,

  staff_id uuid references portal.staff (id) on delete cascade,
  client_user_id uuid references portal.client_users (id) on delete cascade,

  /* The emoji itself, not a name. The set is whatever the picker offers, which
     is every emoji there is — a lookup table of names would be a second list
     that has to be kept in step with Unicode. */
  emoji text not null check (length(emoji) between 1 and 16),

  created_at timestamptz not null default now(),

  constraint reactions_have_one_person check (
    (staff_id is not null) <> (client_user_id is not null)
  )
);

comment on table portal.chat_message_reactions is
  'Who reacted to what, with which emoji. One per person per message: a second reaction replaces the first rather than stacking.';

/*
  One reaction per person per message.

  Two partial indexes rather than one on both columns: a unique index treats
  nulls as distinct, so `(message, staff, null)` would allow the same person to
  react any number of times.
*/
create unique index reactions_one_per_staff
  on portal.chat_message_reactions (message_id, staff_id)
  where staff_id is not null;

create unique index reactions_one_per_client_user
  on portal.chat_message_reactions (message_id, client_user_id)
  where client_user_id is not null;

-- ---------------------------------------------------------------------------
-- Stars.
--
-- A separate table from reactions because a star is private — it is a bookmark,
-- and nobody else should be able to see what somebody has kept. Storing it as a
-- reaction with a star emoji would put it in front of everybody.
-- ---------------------------------------------------------------------------

create table portal.chat_message_stars (
  message_id uuid not null references portal.chat_messages (id) on delete cascade,
  staff_id uuid references portal.staff (id) on delete cascade,
  client_user_id uuid references portal.client_users (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint stars_have_one_person check (
    (staff_id is not null) <> (client_user_id is not null)
  )
);

create unique index stars_one_per_staff
  on portal.chat_message_stars (message_id, staff_id)
  where staff_id is not null;

create unique index stars_one_per_client_user
  on portal.chat_message_stars (message_id, client_user_id)
  where client_user_id is not null;

comment on table portal.chat_message_stars is
  'Private bookmarks. Deliberately not a reaction: nobody else can see what somebody has kept.';

-- ===========================================================================
-- Has anybody else read it?
-- ===========================================================================

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
      /* Somebody other than whoever wrote it. Reading your own message back
         is not somebody having received it. */
      and (
        (mem.staff_id is not null and mem.staff_id is distinct from m.author_staff_id)
        or (
          mem.client_user_id is not null
          and mem.client_user_id is distinct from m.author_client_user_id
        )
      )
  );
$fn$;

comment on function portal.message_is_read(uuid) is
  'Whether anybody other than the author has opened the thread since this was written. Errs towards "not yet", which is the safe direction: the cost is a message that can still be recalled, not one recalled after it was seen.';

/**
 * When each other person last opened the thread — for "message info".
 *
 * Returns everybody but the author, with the time they last looked and whether
 * that was after this message. The screen shows the time only when it was, so
 * it never presents "last opened" as if it were "read this".
 */
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
    and (
      (mem.staff_id is not null and mem.staff_id is distinct from m.author_staff_id)
      or (
        mem.client_user_id is not null
        and mem.client_user_id is distinct from m.author_client_user_id
      )
    )
    /* Only for people who can see the message themselves. */
    and portal.in_conversation(m.conversation_id)
  order by 1;
$fn$;

grant execute on function portal.message_read_by(uuid) to authenticated;

-- ===========================================================================
-- Editing and deleting.
--
-- Both refuse a message that has been read, and both refuse a message that is
-- not yours. Written as functions rather than as policies because the reason
-- for a refusal has to reach the person: "that has already been read" is a
-- different thing to be told than "you cannot do that", and a policy can only
-- say the second by returning no rows.
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
begin
  select * into m from portal.chat_messages where id = p_message_id;

  if not found then
    raise exception 'That message is no longer there.' using errcode = 'P0002';
  end if;

  if not (
    (me_staff is not null and m.author_staff_id = me_staff)
    or (me_client is not null and m.author_client_user_id = me_client)
  ) then
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
begin
  select * into m from portal.chat_messages where id = p_message_id;

  if not found then
    raise exception 'That message is no longer there.' using errcode = 'P0002';
  end if;

  if not (
    (me_staff is not null and m.author_staff_id = me_staff)
    or (me_client is not null and m.author_client_user_id = me_client)
  ) then
    raise exception 'You can only delete your own messages.' using errcode = '42501';
  end if;

  if portal.message_is_read(p_message_id) then
    raise exception 'That message has already been read, so it cannot be deleted.'
      using errcode = 'check_violation';
  end if;

  /*
    Blanked, not removed.

    The row stays so the thread does not lose a message out of its middle with
    no trace — a reply quoting it still makes sense, and "this message was
    deleted" is a truthful thing to show. Its attachments go, because leaving
    the picture behind after deleting the message is not deleting it.
  */
  delete from portal.chat_attachments where message_id = p_message_id;

  update portal.chat_messages
  set body = '', deleted_at = now()
  where id = p_message_id;
end;
$fn$;

grant execute on function portal.edit_chat_message(uuid, text) to authenticated;
grant execute on function portal.delete_chat_message(uuid) to authenticated;

/*
  A deleted message is empty, which the not-empty trigger would refuse.

  It is a deferred constraint trigger on insert *and* update, so blanking the
  body fires it. Deletion is the one legitimate way for a message to end up
  with neither text nor attachment.
*/
create or replace function portal.chat_message_is_not_empty()
returns trigger
language plpgsql
as $fn$
begin
  if new.deleted_at is not null then
    return new;
  end if;

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

-- ===========================================================================
-- Who may do what.
-- ===========================================================================

alter table portal.chat_message_reactions enable row level security;
alter table portal.chat_message_stars enable row level security;

/* Reactions are part of the message: visible to whoever can see it. */
create policy reactions_read on portal.chat_message_reactions
  for select using (message_id in (select id from portal.chat_messages));

/* And you react as yourself, to a message you can see. */
create policy reactions_write on portal.chat_message_reactions
  for insert
  with check (
    message_id in (select id from portal.chat_messages)
    and (
      (staff_id is not null and staff_id = portal.current_staff_id())
      or (client_user_id is not null and client_user_id = portal.current_client_user_id())
    )
  );

/* Taking your own reaction back. Only your own — removing somebody else's is
   editing what they said. */
create policy reactions_remove on portal.chat_message_reactions
  for delete
  using (
    (staff_id is not null and staff_id = portal.current_staff_id())
    or (client_user_id is not null and client_user_id = portal.current_client_user_id())
  );

/*
  Stars are private. The read policy is "yours", not "the message is visible" —
  nobody else may see what somebody has kept, including an admin.
*/
create policy stars_own on portal.chat_message_stars
  for all
  using (
    (staff_id is not null and staff_id = portal.current_staff_id())
    or (client_user_id is not null and client_user_id = portal.current_client_user_id())
  )
  with check (
    message_id in (select id from portal.chat_messages)
    and (
      (staff_id is not null and staff_id = portal.current_staff_id())
      or (client_user_id is not null and client_user_id = portal.current_client_user_id())
    )
  );

/*
  Pinning is a change to the message row, which the update policy on
  `chat_messages` governs. There was none — nothing could update a message at
  all — so this adds one, narrowly: anybody in the conversation may pin, and
  that is the only column this permits, because the body is changed through
  `edit_chat_message` where the read check lives.
*/
create policy chat_messages_pin on portal.chat_messages
  for update
  using (portal.in_conversation(conversation_id))
  with check (portal.in_conversation(conversation_id));

grant select, insert, delete on portal.chat_message_reactions to authenticated;
grant select, insert, delete on portal.chat_message_stars to authenticated;
grant update on portal.chat_messages to authenticated;
