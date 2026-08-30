# Client portal and task tracker — progress

**What this is.** The application clients sign in to, to see how their project is
going, and the board the team works from. One codebase, two audiences: `/portal`
belongs to clients, `/work` belongs to the team.

**Started 2026-08-29.** Phase 6 of the estate roadmap in the company website's
spec (§21.2).

---

## Where this lives, and why it is on its own

**A separate project, in its own folder, with its own deploy.** That is the
owner's decision, made on 2026-08-29 and recorded here because it goes against
what the spec originally said:

> ek project ki chejo ko dusre project se dependent mat karo — ho sakta hai
> future me us project me kuch change ho to baki project me effect hoga, isliye
> alag hi kar do sab kuch

The spec (§21.5) had planned the portal **inside** the company website, reasoning
that it shares auth, media, clients and notifications with that admin and
splitting it would duplicate all four. That reasoning is correct and the cost is
real. It was overruled for a reason that is also correct: a change to the website
must never be able to break a client's login.

**What the separation costs, so nobody is surprised by it later:**

| Duplicated | Why it could not be shared |
|---|---|
| Design tokens (`globals.css`) | A shared package would be the dependency that was rejected. Kept in step by hand |
| The brand loader | Same. The owner's standing rule is one loader across the estate, so the *behaviour* is copied deliberately |
| The staff list (`portal.staff`) | The website has `company.profiles`; this schema cannot read it. **A person who joins or leaves must be added or removed in both** |
| UI primitives (button, field) | Small, and copying them is cheaper than a package nobody owns |

**What is genuinely shared, and is not a dependency:**

- **The Supabase project.** One database, two schemas: the website owns
  `company`, this owns `portal`. No foreign key crosses between them —
  `clients.lead_id` points at `company.leads` as a bare uuid with no constraint,
  so a migration over there cannot fail a write over here.
- **Supabase auth.** One person, one login, one password, both applications.
  Only what they may *do* is separate.

---

## How far along this is

**Counted from the checklist below, never typed by hand** — the same rule the
company website follows, for the same reason: a percentage somebody types drifts,
and once one number is wrong nobody believes any of them.

| | |
|---|---|
| **Built** | 24 of 24 items — **100%** |
| **Left** | Nothing in code. One minute of the owner's time, below. |

**Changed on 2026-09-02, without moving the count.** The page container stopped
at 1280px on every screen size, so a 1600px or 1920px monitor — which is what
this is actually used on — left a third of its width empty while the tables
truncated and the board scrolled. It now steps up to 90rem above a 1600px
viewport and 100rem above 1920. Prose is untouched: `.measure` caps body copy at
68ch whatever the container does.

Steps rather than a fluid width, because a layout that is never twice the same
cannot be checked, and "it looked fine on mine" is how the 1280px cap survived
this long.

**All migrations are applied, and checked rather than assumed.** `…013` through
`…019` went in on 2026-08-30. Two scripts prove it and stay in the repository:

    npm run check:schema     every column, view and function the code reads
    npm run check:policies   signed in as a real developer and a real client
                             (13 checks, all holding)

The second is the one worth running twice a year. It tries to do things those
people should not be able to do — read an unapproved request, raise a task to
urgent, read somebody's attendance — and reports what got through.

**A defect was found this way, immediately after applying `…018`**, by looking at
rows rather than at code: two requests were already `converted` with no
`approved_at`, because the column did not exist when they were agreed. Left
alone, the developer doing that work could not see the request behind it, and the
next save of either row would have been refused. `…019` backfills them and
loosens one constraint, with the reasoning written into the file.

---

## Done

- [x] **Project scaffolded** — Next 16.3.3, React 19.2.8, TypeScript, Tailwind 4.
      The same versions as the company website, so a lesson learned in one is
      worth something in the other.
- [x] **Design tokens and both themes**, with the flash-free script. Light and
      dark are two designed palettes, not one and its inverse.
- [x] **The brand loader** — the mark arriving from both sides and the arrow
      drawing itself. The owner's standing rule: this loader, everywhere.
- [x] **The `portal` schema** — 15 tables, 15 enums, in five migration files.
      Written, not run.
- [x] **Progress and health, computed by the database.** A trigger recomputes a
      phase, a project and its health whenever a task's status, estimate, phase
      or visibility changes. **Nothing anywhere writes a percentage.**
- [x] **Row-level security on every table**, written in terms of three functions
      so "who is this?" has one answer rather than fifteen.
- [x] **Auth**: sign in, sign out, session resolution, and the three guards
      (`requireStaff`, `requireClient`, `requireAnyone`).
- [x] **The proxy**, with a four-second limit on the auth call — carried over
      from a defect found in the company website the same week, where an
      unbounded `getUser()` meant a slow auth server hung every page a signed-in
      person opened.
- [x] **The client portal**: their projects, a project overview built to answer
      four questions above the fold, the work list, the agreed scope, their
      requests, and approvals they can answer.
- [x] **The team's board**: their own work across every project, the unassigned
      strip, every project, one project in full, and the request queue.
- [x] **30 unit tests**, including one that reads the enum values out of the
      migrations and checks every one has a label — the failure a type system
      cannot catch, because a migration does not touch TypeScript.
- [x] **Screens for creating clients and projects**, with the whole commercial
      picture on one form: what they asked for, what we will build, what it does
      not include, the money, the terms.
- [x] **The client document**, printable to PDF from the browser rather than
      generated by a library — the same page the client reads, so there is no
      second rendering to disagree with the first.
- [x] **Money that is counted, never typed.** The quote and the discount are
      fields; what is paid is the sum of the receipts and what is outstanding is
      arithmetic. Overpayment is reported as credit rather than as a negative.
- [x] **Approval creates the accounts.** Marking a project approved makes the
      developer's and the client's logins, links them, and emails both — once,
      and it refuses a second run.
- [x] **The change allowance.** How many rounds of changes are included, and the
      sentence saying what counts as one. The tracker counts against it, but only
      after the project is delivered.
- [x] **The request conversation, and the approval gate.** A client's request is
      a thread that lives here and **nowhere else** until somebody approves it —
      no developer can see one before that, enforced by the row policy. Internal
      messages inside the thread are staff-only.

## Not done

- [x] **Run the migrations.** Done by the owner 2026-08-30.
- [x] **Expose the `portal` schema to the API.** Done — and this line sat here
      ticked-as-open for a fortnight after it was, which is its own small lesson:
      a checklist nobody re-reads is a checklist that lies. Verified rather than
      remembered, by asking the API for a row.
- [x] **The types can no longer disagree with the database.** Not by replacing
      the hand-written file — it carries the reasoning behind each column, which
      is the most useful thing in it. `npm run gen:types` reads the live schema
      into `database.generated.ts`, and `src/types/conformance.ts` compares the
      two at compile time: missing columns, invented ones, and columns typed as
      never-null that the database allows to be null. **It found three columns
      already adrift the first time it ran** — `role_key`, `tracker_menu_extra`
      and `tracker_menu_denied`, added by a migration weeks earlier and never
      typed here.

      `supabase gen types` was the obvious tool and could not be used: it needs
      either a management token with privileges this account does not have, or
      Docker, which is not on this machine. A tool nobody can run is not a tool,
      so the generator is forty lines of SQL against `information_schema`.
- [x] **Adding people at a client.** Until now a client got exactly one login,
      made when their project was approved; everybody else was inserted by hand.
      A contact is now added on the client's page, gets a generated password by
      email, and can be removed later — which ends their access and keeps
      everything they wrote, because a deleted person makes their own comments
      unattributable.
- [x] **Files.** A **private** bucket, and every download goes through one route
      that asks the database *as the person clicking* before signing a URL that
      lives sixty seconds. A public bucket would mean one leaked path is one
      client reading another's contract, with no sign-in and no record. Storage
      policies were deliberately not written: a second set of rules, in another
      language, about the same question, is how two answers drift apart.
- [x] **Chat per project** (spec §24.5). One thread, not channels — a
      per-project chat with channels is a chat application, and this is not one.
      Internal messages are staff-only, enforced by the policy and proved by
      planting one and asking the client for it.
- [x] **Browser tests.** A harness, and eight tests: the client's view (which
      runs), and the staff screens (which skip until somebody saves a session —
      `node e2e/save-admin-session.mjs` — because that account is the owner's own
      and its password is deliberately not in a file).

## Possible, and deliberately not done yet

- **Documents, payments and signing** (spec §27) — proposals, invoices, what is
  paid and what is outstanding, with the numbers derived rather than typed. It is
  the single feature that would most make this look like a company, and it is a
  phase of its own rather than a corner of this one.
- **Notifications.** The activity feed exists; nothing emails or messages anybody
  about it. Worth doing after the invite flow, not before.
- **Time tracking.** `time_entries` exists, team-only by design, with no screen.

---

## The rules this project inherits

These are the owner's standing instructions across the estate. They bind here as
much as the company website.

- **Everything local.** No project data goes to any third party. See
  [privacy-rules.md](privacy-rules.md).
- **One logo and one loader, in every project** — the mark from
  `public/brand/`, never the name typed out as text, and the company website's
  loader reproduced rather than redesigned. Full rule and what went wrong here:
  [brand-rules.md](brand-rules.md).
- **Nobody commits or pushes but the owner.**
- **Migrations are run by the owner**, by hand, in the Supabase SQL editor.
- **Finish, say so, then test in a browser** — in that order, not before.
- **Every project carries a counted percentage** in its own `PROGRESS.md`, with a
  sentence beside it saying what the number does not cover.
