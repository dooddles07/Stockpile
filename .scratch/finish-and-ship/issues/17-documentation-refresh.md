# 17: Documentation catches up with what shipped

**What to build:** The amendments and additions that this phase's decisions require, so the documented system and the running one agree.

Three ADRs describe things that are no longer true, and one decision made in this phase is exactly the kind a future reader will question.

**ADR-0010 is amended:** the daily reset is a scheduled workflow running `db:seed` against the production connection string, not an authenticated HTTP endpoint. The consequence about the endpoint being "the single most dangerous route in the application" is removed, because the route no longer exists. Everything else in that ADR — truncate-and-reseed over a branch reset, the storage argument, the shared demo account, the accepted risk of a visitor's world resetting underneath them — is unaffected and stands.

**ADR-0004's amendment is extended:** identity via Auth.js is not deferred by omission but declined for this phase, deliberately, because a public writable demo behind a registration wall is a demo nobody enters. The cookie-held role and its representative user are the actor source by decision. The authorization half is now fully true, including the runtime permission editor that ticket 13 built.

**ADR-0009 is amended:** end-to-end tests remain the strategy, and the deployed instance is verified by the smoke spec run against production immediately after each daily reset. The write specs are deliberately not run there.

**A new ADR records the deletion decision:** screens without a write path are deleted rather than stubbed. This meets all three tests — it is hard to reverse, since the screens and their tables go; it is surprising without context, since a reader will otherwise assume Integrations was lost rather than removed; and it was a real trade-off against keeping a fuller-looking product.

**CONTEXT.md gains one term: Approval.** A decision recorded against a Document that permits it to proceed, made by an Actor with the permission for that document type, appending an Event and moving no stock. Nothing else in the glossary changes: no new stock concept, no new document type, no change to how balances are derived.

**The README** gains the production URL, the three-branch Neon convention, and a correction to anything it says about screens deleted in ticket 15.

**Blocked by:** 16 (company settings, the one setting worth having).

**Status:** resolved

- [x] ADR-0010 amended: reset by workflow, no endpoint
- [x] ADR-0004 amendment extended: identity declined for this phase, permission editor now real
- [x] ADR-0009 amended: post-reset production smoke run
- [x] A new ADR records that screens without a write path are deleted rather than stubbed
- [x] CONTEXT.md gains **Approval**, with an `_Avoid_` line, and nothing else changes
- [x] README carries the production URL, the branch convention, and no reference to a deleted screen
- [x] Every claim on the landing page is true of the deployed instance

## Comments

**2026-09-03** — ADR-0010 amendment and ADR-0011 already landed with ticket 15; verified both still cover the requirement. This ticket added: ADR-0004 amendment reframed (identity via Auth.js declined for this phase by decision, permission matrix editor from ticket 13 now cited as real); ADR-0009 gained a post-reset production smoke amendment; CONTEXT.md gained the **Approval** term with an `_Avoid_` line; README's "What it covers" table dropped the deleted `tasks`, `automation rule builder`, and `integrations` screens. Landing page checked claim by claim against the deployed instance — seven roles seeded, no deleted-screen references, every link live — no change needed.
