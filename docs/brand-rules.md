# The logo and the loader — the same ones, in every project

**This is a standing instruction from the owner, given twice on 2026-08-30
because the first attempt at this project got it wrong. It binds every
application in the estate: the company website, this portal, the task tracker,
and all fifteen demo sites.**

> logo bhi Apka Vission ka hi use karna hai — text me "Apka Vission" mat likho,
> logo use karo jo services me hai. Aur yahi logo aur loader services wala hi
> sab jagah, har project me.

---

## The rule, in one line each

**The logo is the file, never the name typed out.** Wherever the brand appears —
a header, a sign-in screen, an email, a document — it is the actual mark from
`public/brand/`. Two styled words that say "Apka Vission" are a *description* of
the brand, not the brand.

**The loader is the company website's loader, everywhere.** The mark between the
two halves of the name, the words arriving from the left and the right, the mark
breathing, and the rising arrow drawing itself underneath. Laid over the page as
an overlay rather than replacing it.

**Neither is redesigned per project.** Not "adapted", not "simplified for this
context". A second loader is a second brand.

---

## What went wrong here, so it is not repeated

This project's first loader rendered the name as two styled words with an
animation of my own devising, and no mark at all. The header did the same. Two
separate mistakes in one component:

1. **It changed something already settled.** The loader had been designed,
   argued about and fixed in the company website. Rebuilding it from a
   description was never the job.
2. **It dropped the logo.** The brand became text, which is the one thing it
   must never be.

Both were caught by the owner looking at the screen, which is the most expensive
way to catch anything.

---

## The files

Four SVGs, copied into `public/brand/`:

| File | Where it is used |
|---|---|
| `logo-light.svg`, `logo-dark.svg` | The full lockup: headers, sign-in, anywhere the brand stands alone |
| `symbol-light.svg`, `symbol-dark.svg` | The mark on its own: inside the loader, between the two words |

**Both themes are always emitted and CSS hides one** (`.theme-light-only` /
`.theme-dark-only` in `globals.css`). Choosing in JavaScript would mean either a
flash of the wrong mark or a logo that never appears without hydration — and the
loader is the one screen that exists precisely because hydration has not
happened yet.

## Why they are copied rather than imported

The owner's other standing rule is that no project may depend on another, so
there is no shared package to import them from. **The cost of that decision is
this: the SVGs and `brand-loader.tsx` are duplicated per project and kept in
step by hand.**

That is a real cost and it is written down rather than hidden. If the mark ever
changes, it changes in every project — there is nothing that can do it for you.

## What is deliberately not copied

The company website puts a small WebGL field behind the lockup on its full-screen
loader. That needs three.js, which is a large dependency for atmosphere on a
screen nobody should be looking at for long, so it is not here.

Everything a person actually recognises — the mark, the entrance from both
sides, the breathing, the arrow — is.

---

## The logo goes in every email too

**Owner's instruction, 2026-08-30:** every email template carries the Apka
Vission logo.

Not decoration. An email that hands somebody their sign-in details and arrives
looking like plain text from an address they do not recognise is the exact shape
of a phishing message, and the correct response to one of those is to ignore it.
The mark is what tells a client the message is from the company they hired.

Two things make it actually appear, and both matter:

**Attached, not linked.** The image is a part of the message, referenced as
`cid:apka-vission-logo`. That renders before anybody presses "show images" —
which most people never press. A hosted URL leaves a broken box in the header of
the one email that most needs to look legitimate.

**On an explicit dark bar.** The mark is light ink. Left on the mail client's own
background it vanishes in any inbox forcing a light theme, and it looks perfect
while testing because the tester's inbox happens to be dark.

Every message is sent as **HTML and plain text together**. The text half is not a
fallback nobody sees: it is what a screen reader in a plain-text client reads,
and what survives a corporate filter that strips HTML.

`src/lib/email/layout.ts` is the frame; no template builds its own. The company
website has the same arrangement at `services/src/lib/email/layout.ts`, and the
two are kept in step by hand like everything else brand-related.
