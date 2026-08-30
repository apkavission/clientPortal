# Nothing about this project leaves this machine

The owner's standing rule, and it binds this project exactly as it binds the
company website and the demo repositories.

## What that means in practice

**No third-party service holds client data.** The only places project data
exists are:

1. **This machine** — the source, and `.env.local`, which is git-ignored.
2. **Supabase** — the owner's own project. Client rows, tasks, requests.
3. **The owner's own deployment**, when there is one.

Nothing else. No analytics, no error-reporting service, no session recorder, no
AI service reading the database.

## What is not in this repository, ever

- **Secrets.** `.env.local` is ignored. The service-role key, the database
  password and the access token are never printed, never pasted into a chat
  window, and never committed. `.env.example` carries the key names and no
  values.
- **Client data.** No seed file with a real client in it. No screenshot of a real
  project. No exported CSV.

## The one thing that cannot be made private, said plainly

Work on this codebase is done through an AI coding tool, and **that conversation
runs through Anthropic's API** — that is how the tool works and it cannot be
switched off from inside it.

So the protection is not "nothing is transmitted". It is:

- **No secret value is ever typed into that conversation.** Keys are read from
  `.env.local` by scripts and never printed. When one has to be generated, it is
  written straight to the file.
- **No real client's data is used as an example.** Test data is invented; real
  rows are read by count, not by content.

That is the honest description. A promise that nothing at all is transmitted
would be a false one, and a false promise is worse than a limitation somebody
knows about.

## Dependencies

A package is a permanent dependency and a place data could go. Nothing is added
without a reason that is written down. The current list is deliberately short:
Next, React, Tailwind, Supabase's two clients, `zod`, `lucide-react`, `clsx` and
`tailwind-merge`, plus Vitest and Playwright for tests.

No analytics package. No error tracker. No component library.
