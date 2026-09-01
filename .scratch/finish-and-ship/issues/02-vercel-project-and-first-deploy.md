# 02: The Vercel project, and the first live URL

**What to build:** Stockpile deployed to a public Vercel URL, running against the primary Neon branch, with the seeded dataset in it.

Nothing about the application is deployed today. ADR-0010 describes a public writable demo in the present tense and the landing page invites visitors to use one. This ticket makes the URL exist.

The unknowns here are the reason this ticket is second rather than last. The Neon WebSocket-pooled driver was chosen in phase 2 because ADR-0006's locking requires interactive transactions, and how it behaves from a Vercel function under Fluid Compute — connection reuse across concurrent invocations, the free tier's connection ceiling, the first request after the compute autosuspends — is not something the local or CI environment exercises. `next build` is required to succeed with no `DATABASE_URL` present, so nothing about the build changes; the connection string is a runtime environment variable only.

Production is the primary Neon branch. It is migrated and seeded once here, by hand, and from ticket 03 onward by workflow.

**Blocked by:** 01 (a Neon `dev` branch, and one purpose per environment).

**Status:** open

- [ ] A Vercel project is linked to this repository and deploys `main` to production
- [ ] `DATABASE_URL` is set as a production environment variable pointing at the primary Neon branch
- [ ] The primary branch is migrated and seeded, and the deployed instance renders real data
- [ ] An interactive transaction succeeds against production — a write path from phase 2 completes end to end on the live URL
- [ ] The landing page, `robots.ts`, `sitemap.ts` and the generated icon and OG image all resolve correctly on the deployed origin
- [ ] The production URL is recorded in the README
