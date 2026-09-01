# 02: The Vercel project, and the first live URL

**What to build:** Stockpile deployed to a public Vercel URL, running against the primary Neon branch, with the seeded dataset in it.

Nothing about the application is deployed today. ADR-0010 describes a public writable demo in the present tense and the landing page invites visitors to use one. This ticket makes the URL exist.

The unknowns here are the reason this ticket is second rather than last. The Neon WebSocket-pooled driver was chosen in phase 2 because ADR-0006's locking requires interactive transactions, and how it behaves from a Vercel function under Fluid Compute — connection reuse across concurrent invocations, the free tier's connection ceiling, the first request after the compute autosuspends — is not something the local or CI environment exercises. `next build` is required to succeed with no `DATABASE_URL` present, so nothing about the build changes; the connection string is a runtime environment variable only.

Production is the primary Neon branch. It is migrated and seeded once here, by hand, and from ticket 03 onward by workflow.

**Blocked by:** 01 (a Neon `dev` branch, and one purpose per environment).

**Status:** resolved

- [x] A Vercel project is linked to this repository and deploys `main` to production
- [x] `DATABASE_URL` is set as a production environment variable pointing at the primary Neon branch
- [x] The primary branch is migrated and seeded, and the deployed instance renders real data
- [x] An interactive transaction succeeds against production — a write path from phase 2 completes end to end on the live URL
- [x] The landing page, `robots.ts`, `sitemap.ts` and the generated icon and OG image all resolve correctly on the deployed origin
- [x] The production URL is recorded in the README

## Comments

**2026-09-01** — Done. The live URL is https://stockpile-peach.vercel.app.

The Vercel project already existed outside the scope this session's token can
read (creating or inspecting `stockpile` returns 409/403/404), so the project,
its git link and its `DATABASE_URL` were not created here. Everything they
produce was verified from outside instead:

- `/`, `/robots.txt`, `/sitemap.xml`, `/icon` and `/opengraph-image` all return
  200 on the deployed origin, and `robots.txt`, `sitemap.xml` and the `og:*`
  tags carry `https://stockpile-peach.vercel.app`, not `localhost` — so
  `NEXT_PUBLIC_SITE_URL` is set in production too.
- `/inventory/stock-levels` renders the seeded dataset: 636 stock records,
  266 distinct SKUs, 171,243 units on hand. The primary branch is migrated and
  seeded and `DATABASE_URL` points at it.
- An adjustment was recorded through the live UI (Absorbent Spill Kit Chemical
  50L at DC-01 · C-03-02-04, count-error, remove 1). On-hand went 69 → 68 in
  the same request. That is `applyStockChange`'s interactive transaction —
  row lock, event append, projection update — completing under Fluid Compute,
  which is the unknown this ticket existed to retire.

Unrelated but worth recording: the Neon SQL-over-HTTP endpoint still returns
`data transfer quota exceeded` (the block described in ticket 01), while the
pooled WebSocket driver the app uses serves production fine. Ticket 01 stays
blocked on that quota; ticket 02 does not depend on it.

