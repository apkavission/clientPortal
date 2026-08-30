-- ===========================================================================
-- Work is given, not claimed — and a developer can hand it on.
--
-- The owner’s instruction, 2026-08-30:
--
--   > ye "take this" aur "put this down" nahi hoga. Ek baar jo assign ho gaya hai
--   > wo us developer ko jayega hi — accept ya reject uske paas nahi hai. Wo bas
--   > kisi aur developer ko transfer kar sakta hai, aur us developer ke paas
--   > option hai accept ya reject kare — wo bhi ek baar, aur wahan reason aayega.
--
-- ---------------------------------------------------------------------------
-- Why the two directions are not symmetrical.
--
-- **An admin’s assignment is a decision.** Letting a developer decline it turns
-- a plan into a negotiation, and the work sits unowned while it happens. If it is
-- the wrong person, the person who decided that is the one who changes it.
--
-- **A transfer between developers is a request.** Nobody may put their work on a
-- colleague without that colleague agreeing — that is the difference between
-- handing something over and dumping it. So the receiver answers, and until they
-- do the task stays exactly where it is, with the person who currently owns it.
--
-- **The answer is once.** A transfer is a moment between two people, not a
-- standing invitation to change your mind. Reopening one would leave a task whose
-- owner depends on who last clicked, and no way to say who was responsible on
-- Tuesday.
--
-- **Both sides give a reason**, and both are refused without one. "Passing this
-- to you" and "no" are not handovers; they are the start of an argument that
-- happens on the phone and never reaches the record.
-- ===========================================================================

create table if not exists portal.task_transfers (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references portal.tasks(id) on delete cascade,

  from_staff_id uuid not null references portal.staff(id) on delete cascade,
  to_staff_id   uuid not null references portal.staff(id) on delete cascade,

  /* Why it is being handed over. Required — see above. */
  reason        text not null check (length(btrim(reason)) > 0),

  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'rejected')),
  responded_at  timestamptz,
  response_reason text,

  created_at    timestamptz not null default now(),

  -- Handing something to yourself is a no-op with a paper trail.
  constraint transfer_is_to_somebody_else check (from_staff_id <> to_staff_id),

  -- An answer records when it was given.
  constraint transfer_answer_is_timed check (
    status = 'pending' or responded_at is not null
  ),

  /*
    A refusal must say why.

    Accepting needs no words — the work moving is the message. Refusing sends it
    back to somebody who now has to plan around it, and "no" on its own tells
    them nothing they can act on.
  */
  constraint transfer_refusal_is_explained check (
    status <> 'rejected'
    or (response_reason is not null and length(btrim(response_reason)) > 0)
  )
);

comment on table portal.task_transfers is
  'One developer offering a task to another. The receiver answers once, with a reason if they refuse. An admin''s assignment is not a transfer and is not answerable.';

-- One open offer per task. Two people cannot both be being asked to take the
-- same work, and a second offer while one is open is somebody forgetting.
create unique index if not exists task_transfers_one_open
  on portal.task_transfers (task_id) where status = 'pending';

create index if not exists task_transfers_to_idx
  on portal.task_transfers (to_staff_id, status);
create index if not exists task_transfers_task_idx
  on portal.task_transfers (task_id, created_at desc);

/*
  Accepting moves the task. Nothing else does.

  In a trigger rather than in the application because the two writes have to
  happen together: an accepted transfer whose task never moved is a record saying
  work changed hands when it did not, and it would be invisible until somebody
  wondered why their board was wrong.
*/
create or replace function portal.transfer_moves_the_task()
returns trigger
language plpgsql
security definer
set search_path = portal, public
as $$
declare
  project uuid;
begin
  if new.status = 'accepted' and old.status = 'pending' then
    update portal.tasks
    set assignee_id = new.to_staff_id
    where id = new.task_id
    returning project_id into project;

    /*
      Accepting work puts you on the project.

      Without this, somebody can accept a task and then not see it: the board is
      filtered by membership, so the task would move to a person for whom the
      project does not exist. Discovering that at 9am on a Monday, with the work
      already yours, is the worst possible moment.

      `on conflict do nothing` because being on it already is the normal case,
      and the existing row carries whatever role and visibility an admin set.
    */
    if project is not null then
      insert into portal.project_members (project_id, staff_id)
      values (project, new.to_staff_id)
      on conflict (project_id, staff_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists task_transfers_move on portal.task_transfers;
create trigger task_transfers_move
  after update on portal.task_transfers
  for each row execute function portal.transfer_moves_the_task();

/*
  Answered once, and then it is history.

  Without this, "reject" then "accept" a week later would move a task nobody was
  expecting to move — and the record would show only the second answer, so the
  week in between would be unexplainable.
*/
create or replace function portal.transfer_is_answered_once()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'This handover has already been answered. Start a new one instead.';
  end if;

  return new;
end;
$$;

drop trigger if exists task_transfers_answered_once on portal.task_transfers;
create trigger task_transfers_answered_once
  before update on portal.task_transfers
  for each row execute function portal.transfer_is_answered_once();

-- ---------------------------------------------------------------------------
-- Who may do what.
--
-- **Offer**: only the person the task is currently assigned to. Handing on work
-- that was never yours is not a transfer, it is a reassignment — and that is an
-- admin’s job.
--
-- **Answer**: only the person being offered it.
--
-- **Read**: any member of staff. A handover is not private; the point of writing
-- the reasons down is that somebody else can read them later.
-- ---------------------------------------------------------------------------

alter table portal.task_transfers enable row level security;

grant select, insert, update on portal.task_transfers to authenticated;
grant all on portal.task_transfers to service_role;

drop policy if exists transfers_read on portal.task_transfers;
create policy transfers_read on portal.task_transfers
  for select using (portal.is_staff());

drop policy if exists transfers_offer on portal.task_transfers;
create policy transfers_offer on portal.task_transfers
  for insert with check (
    status = 'pending'
    and from_staff_id in (select id from portal.staff where auth_user_id = auth.uid())
    and exists (
      select 1 from portal.tasks t
      where t.id = task_id and t.assignee_id = from_staff_id
    )
  );

drop policy if exists transfers_answer on portal.task_transfers;
create policy transfers_answer on portal.task_transfers
  for update using (
    to_staff_id in (select id from portal.staff where auth_user_id = auth.uid())
    or portal.is_admin()
  )
  with check (
    to_staff_id in (select id from portal.staff where auth_user_id = auth.uid())
    or portal.is_admin()
  );
