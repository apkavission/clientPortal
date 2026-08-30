# What only you can do

Everything here needs an account, a decision or a password that is not a
developer's to have. Nothing in the list can be done from the code.

The order matters: **nothing else can be checked until step 1 is done.**

---

## 1. ~~Run the migrations~~ — done, and checked on 2026-08-30

**Nothing to run.** All twenty-one of this project's migrations are applied,
including 013 to 021, which were added late and were believed applied before
anybody had asked the database. They were not, and every screen built on them
failed on a missing column — which is why the answer now comes from a command
rather than from memory:

```
cd services && npm run verify:estate    # every project, every migration
cd portal   && npm run check:schema     # 23 things this code reads, by name
cd portal   && npm run check:policies   # 13 rules, tested with real rows
```

The last one plants a client, a project and an internal note and then tries to
read them as the wrong person. An earlier version counted rows in empty tables
and could not fail; a check that cannot fail is worse than no check.

**Do not paste any of them in again.** They are not written to be run twice.

## 1b. Let the API see the new schema — thirty seconds

**This one is not SQL, and without it nothing works.**

**Where:** Supabase dashboard → your project → **Project Settings → API** →
**Exposed schemas** → add **`portal`** → save.

Supabase serves the database through PostgREST, and PostgREST only answers for
schemas that are on that list. `company` is on it because the website was set up
first. A brand new schema is not, so every table in it exists in the database and
is invisible to the application:

```
PGRST106 — Only the following schemas are exposed: public, graphql_public, company
```

The tables are fine. The grants in migration 5 are fine. The door is simply not
open yet.

**This step was missing from this checklist until 2026-08-30**, and it was found
the only way it could be — by trying to load a screen and getting nothing back.
Writing "run the migrations" and stopping there was incomplete advice.

---

## 2. ~~Make yourself a staff member~~ — done by migration 6

Migration `20260830000006_portal_grants.sql` inserts it, matched by email
against the account already in Supabase auth. Nothing to do here.

The reason it has to come from a migration rather than from a screen: the policy
that guards the staff table asks whether you are an owner, and it answers that by
reading the staff table. Until the first row exists, nobody is an owner and
nobody can create one. It has to arrive from outside the policies.

Until that row exists, signing in lands you on a page saying the account cannot
open anything. That is the correct answer, and it is exactly what a client with
an unfinished invite would see.

<details>
<summary>If the email ever needs changing</summary>

```sql
insert into portal.staff (auth_user_id, full_name, email, role)
select id, 'Your Name', email, 'owner'
from auth.users
where email = 'you@example.com'
on conflict (auth_user_id) do nothing;
```

</details>

---

## 3. Decide where it is served — when you are ready to deploy

The portal runs on its own, separately from the website. It needs:

- Its own deployment (its own Vercel project, or wherever the website ends up)
- A subdomain — `portal.yourdomain.com` is the obvious one
- The same three environment variables the website uses, plus
  `NEXT_PUBLIC_SITE_URL` pointing at that subdomain

Locally it runs on **port 3100**, so it and the website can both be open.

---

## 4. Add your first client — after step 1

There is no screen for this yet; it is on the list in
[PROGRESS.md](PROGRESS.md). Until it exists, a client and their project are
created with SQL. Ask and it will be written out for the specific client rather
than guessed at here.

---

## What you do not need to do

- **Nothing needs a payment.** No API, no service, no licence.
- **Nothing needs a second Supabase project.** One database, two schemas.
- **Nothing about the company website changes.** It is not touched by any of
  this, which was the point of keeping them apart.
