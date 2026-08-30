# Documentation

| File | What it is for |
|---|---|
| [PROGRESS.md](PROGRESS.md) | What is built, what is not, what is possible, and the counted percentage. Start here |
| [owner-checklist.md](owner-checklist.md) | The steps only the owner can do — starting with running the migrations |
| [testing.md](testing.md) | What is tested, and the longer list of what is not |
| [brand-rules.md](brand-rules.md) | **Important.** The logo and the loader — the same ones in every project, never redesigned |
| [privacy-rules.md](privacy-rules.md) | Nothing about this project leaves this machine, and what that does and does not mean |

## Running it

```
npm install
cp .env.example .env.local     # then fill it in
npm run dev                    # http://localhost:3100
```

Port 3100 rather than 3000, so this and the company website can both be open.

**It will not do much until the migrations are run.** See
[owner-checklist.md](owner-checklist.md) step 1.
