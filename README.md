# Apka Vission — client portal and task tracker

Clients sign in to see how their project is going. The team works from the same
application, on a board.

```
/portal    a client's projects, progress, scope, requests and approvals
/work      the team's board, every project, and the request queue
```

Both halves are one Next.js application. Which one a person lands on is decided
by whether their login has a row in `portal.staff` or in `portal.client_users`.

## A separate project on purpose

This does not import anything from the company website and never should. The
owner's rule: a change to one must not be able to break the other. What that
costs — duplicated design tokens, a second staff list — is written down in
[docs/PROGRESS.md](docs/PROGRESS.md) rather than discovered later.

The database is shared and the schemas are not: the website owns `company`, this
owns `portal`, and no foreign key crosses between them.

## Getting started

```
npm install
cp .env.example .env.local
npm run dev
```

Then [docs/owner-checklist.md](docs/owner-checklist.md), step 1 — nothing works
until the migrations are run.

## Checks

```
npm run typecheck
npm run lint
npm test
npm run build
```
