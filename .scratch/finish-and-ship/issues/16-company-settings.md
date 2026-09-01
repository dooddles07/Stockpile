# 16: Company settings, the one setting worth having

**What to build:** A single-row `settings` table holding the company name and address, editable from the Company settings page, and read where the company identifies itself.

Six of the seven settings pages are deleted in ticket 15 because they configure values that live elsewhere or configure nothing. Company is the exception: a name and a trading address are genuinely global, belong nowhere else in the model, and have real consumers — the page header, document views, and the metadata on the landing page.

A single-row table is the right shape. Settings here are one record with named columns, not a key-value store, because the set of settings is small, known, and typed. The row is created by the seed and updated in place; nothing creates or deletes it.

**Blocked by:** 15 (delete every surface that cannot do what it offers).

**Status:** open

- [ ] A `settings` table with a single row, created by the seed and included in the truncate-and-reseed
- [ ] An `updateCompanySettings(actor, input, db)` domain function that checks permission first
- [ ] The Company settings page renders the stored values and saves through a server action that validates and delegates only
- [ ] The stored company name is read where the application names the company, rather than hardcoded
- [ ] A Role that forbids editing settings is refused when reaching the domain function directly
- [ ] End-to-end coverage exists for changing the company name and seeing it rendered
