# What is tested, and what is not

Written the same way as the company website's version, and for the same reason:
the useful half of a testing document is the list of what has **not** been
checked, because that is the half nobody writes down and everybody assumes.

---

## What runs today

```
npm run typecheck    tsc --noEmit
npm run lint         eslint
npm test             vitest run        30 tests
npm run build        next build        14 routes
```

All four are clean as of 2026-08-29.

## The 30 unit tests, and why each group exists

**`safeNext` — 7 tests.** Where a person lands after signing in. The failure
being guarded against is not a broken link, it is an **open redirect**: a URL
that starts with this application's own address, passes a genuine sign-in, and
delivers the person somewhere else. The first half being real is what makes it
work on somebody.

One of these tests was wrong when it was written and passed for the wrong
reason — a quoted backslash collapsed, so the test asserted on a string with no
backslash in it. It is written with `String.raw` now, and the story is in the
file, because a test that passes for the wrong reason is worse than no test.

**Labels — 11 tests.** Every enum value has a word and a colour. The compiler
already checks a `Record<Enum, string>`, so this deliberately does something the
compiler cannot: it **reads the enum values out of the migration files** and
checks each one against the map. A migration that adds a status does not touch
TypeScript at all, so the union and the database drift apart silently and the
first anybody knows is a page rendering `undefined`.

It also refuses a label that is the raw value copied across — `in_progress` is a
column value, not a sentence.

**`percent` and `formatDate` — 12 tests.** Both look trivial and both have a
failure that only appears on somebody else's machine: a `NaN` width silently
renders a full bar, and a date formatted without an explicit locale disagrees
between the server and the browser, which is a hydration mismatch a developer
never sees.

---

## What has never been checked

### Everything that needs a database

**No screen in this application has ever been loaded with data.** The migrations
have not been run. Every page has been type-checked, linted and built, and not
one has rendered a real row.

That is the single largest gap and it is deliberate — the SQL is run by the
owner, by convention. Until then this section is the honest state of things.

When the database exists, the first pass is:

- **Sign in as a staff member** — the board, the projects list, one project, the
  request queue.
- **Sign in as a client** — their projects, an overview, work, scope, requests,
  approvals.
- **Sign in as neither** — an auth account with no row in either table must land
  on the no-access page rather than in a redirect loop.

### The rules that only a real database can prove

These are the ones worth doing properly, because each is a rule the application
would appear to obey even if it did not:

- **An internal task must not reach a client.** Not "is not rendered" — must not
  come back from the query at all. Check by signing in as a client and reading
  the network response, not the page.
- **One client must not see another's project.** Take a real project slug from
  client A and open it as client B. It must answer not-found, and it must answer
  exactly what a made-up slug answers.
- **An internal comment must not reach a client**, by the same method.
- **`time_entries` must return nothing to a client.** There is no policy granting
  it, so the correct result is an empty list rather than an error.
- **Progress must move on its own.** Tick a task as done and the client's
  percentage must change with no other action. Then add an internal task and
  confirm the percentage does **not** move.
- **A blocked task must refuse to save without a reason**, from the form and from
  SQL — the constraint is the one that matters.
- **A declined request must refuse to save without a note**, the same way.
- **Two people answering one approval**: open it in two browsers, answer in both.
  The second must be told it has already been answered rather than overwriting
  the first.

### Not automatable here

- **A real phone**, in a hand, on a real connection.
- **A screen reader** through the board and the approval form.
- **A slow or unreachable auth server**, to prove the four-second limit in
  `proxy.ts` does what it says. It is written from a defect diagnosed in the
  company website rather than one reproduced here.

### No browser tests yet

Playwright is installed and no spec is written, because there is nothing to sign
in to. The company website's harness is the model to copy: routes in one file,
a warm-up pass before the suite, and specs that walk **pages with content on
them** rather than only empty ones — that last point came from a real failure
there, where a heading skip hid in an empty page for days.

---

## The rule going forward

A test is written when a defect is found, and it is written to fail on the defect
rather than on its symptom. The comment on the test says what went wrong, so the
next person can tell a genuine failure from a rule they have not read yet.
