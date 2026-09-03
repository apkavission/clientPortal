-- ===========================================================================
-- An admin can remove a message that the person who wrote it no longer can.
--
-- ---------------------------------------------------------------------------
-- **Why this is a second door rather than a loosening of the first.**
--
-- The rule for everybody is that a message which has been read is finished:
-- editing it would be a way to deny having said it. That rule is what makes the
-- thread worth anything as a record, and it does not get an exception.
--
-- But something genuinely wrong does get posted — a client's phone number in a
-- group, a rate somebody should not have seen, an angry sentence — and "it has
-- been read, so it stays forever" is not an answer a company can live with.
--
-- So there is a separate door, and it is deliberately a different shape:
--
--   * only an admin may open it;
--   * it takes a reason, and will not run without one;
--   * what it leaves behind says *an admin removed this*, not "this message was
--     deleted", so nobody thinks the author took their words back;
--   * every use is written to the audit log.
--
-- The difference between the two doors is the point. An admin quietly using the
-- ordinary delete would be indistinguishable from the author using it, and that
-- is exactly the thing a record must not allow.
--
-- ---------------------------------------------------------------------------
-- **Removing, not editing.**
--
-- There is no admin edit, and that is on purpose. Rewriting somebody else's
-- words under their name is not moderation — it is forgery, and there is no
-- reason it should ever be easier than deleting the message and saying so.
-- ===========================================================================

alter table portal.chat_messages
  add column removed_by uuid references portal.staff (id) on delete set null,
  add column removed_by_name text,
  add column removed_reason text;

comment on column portal.chat_messages.removed_by is
  'Set when an admin removed this rather than the author deleting it. The two are shown differently on purpose.';
comment on column portal.chat_messages.removed_by_name is
  'Who removed it, kept as it was. Outlives their account, like every other name in this schema.';

create or replace function portal.admin_remove_chat_message(
  p_message_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = portal, public
as $fn$
declare
  me uuid := portal.current_staff_id();
  my_name text;
  m portal.chat_messages%rowtype;
begin
  if not portal.is_admin() then
    raise exception 'Only an admin can remove somebody else''s message.'
      using errcode = '42501';
  end if;

  /*
    A reason is required.

    Not for the database's sake — for the person reading the audit log in six
    months, who otherwise finds "an admin deleted a message" and no way to tell
    a leaked phone number from a disagreement.
  */
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Say why it is being removed.' using errcode = 'check_violation';
  end if;

  select * into m from portal.chat_messages where id = p_message_id;

  if not found then
    raise exception 'That message is no longer there.' using errcode = 'P0002';
  end if;

  if m.deleted_at is not null then
    return;
  end if;

  select full_name into my_name from portal.staff where id = me;

  delete from portal.chat_attachments where message_id = p_message_id;

  update portal.chat_messages
  set
    body = '',
    deleted_at = now(),
    removed_by = me,
    removed_by_name = coalesce(my_name, 'An admin'),
    removed_reason = btrim(p_reason)
  where id = p_message_id;
end;
$fn$;

comment on function portal.admin_remove_chat_message(uuid, text) is
  'Removes a message an admin judges should not stand, including one already read. Requires a reason, and marks the row as removed by an admin rather than deleted by its author.';

grant execute on function portal.admin_remove_chat_message(uuid, text) to authenticated;

/**
 * What an admin removed, and why.
 *
 * A screen of its own rather than a column on the thread: this is the record
 * that makes the power accountable, and it has to be readable in one place
 * rather than found by scrolling every conversation.
 *
 * Only an admin can read it — it quotes the reasons, which name what was wrong
 * with a message everybody else can no longer see.
 */
create or replace function portal.removed_messages()
returns table (
  id uuid,
  conversation_id uuid,
  conversation_title text,
  author_name text,
  removed_by_name text,
  removed_reason text,
  removed_at timestamptz,
  written_at timestamptz
)
language sql
stable
security definer
set search_path = portal, public
as $fn$
  select
    m.id,
    m.conversation_id,
    coalesce(c.title, p.name, 'A direct thread'),
    m.author_name,
    m.removed_by_name,
    m.removed_reason,
    m.deleted_at,
    m.created_at
  from portal.chat_messages m
  join portal.conversations c on c.id = m.conversation_id
  left join portal.client_projects p on p.id = c.project_id
  where portal.is_admin()
    and m.removed_by is not null
  order by m.deleted_at desc;
$fn$;

grant execute on function portal.removed_messages() to authenticated;
