# 08: Contract — retire the generated dataset at runtime

**What to build:** The point at which Postgres becomes the only source of data the running application reads. Every repository function queries the database, and nothing in the request path touches the generated dataset.

The generator itself survives, and deliberately so. It remains the source the seed script loads from, which is what keeps the fixed seed — and therefore every recorded Playwright assertion, and ADR-0010's daily demo reset — working. What ends here is its role at runtime, not its existence.

The guard established in phase 1 is retargeted rather than removed: instead of confining the dataset to the repository layer, it now confines it to the seed. Any import of the generator from a repository function or a request path fails the build.

This is the gate before any write work begins. Until it is done, a write updating a projection could sit behind a screen still reading from memory — two live sources of truth, and a write that appears to do nothing.

**Blocked by:** 02, 03, 04, 05, 06, 07 (all read tickets).

**Status:** resolved

- [x] No repository function reads the generated dataset
- [x] Nothing in the request path imports the generator
- [x] The seed script remains the generator's only consumer
- [x] The build fails on any import of the generator from outside the seed
- [x] The guard is demonstrated failing on a deliberately added violating import, which is then removed
- [x] The Playwright suite passes unmodified against a seeded database

## Comments

### 2026-08-29 — done

Two repository modules still read `lib/data/store` at the start of this ticket:

- `lib/repo/inventory.ts` — `db.users` (a module-level `Map`) and
  `db.movements` (in `movementsFor`). Both have tables since tickets 06 / 07,
  so `users` now goes through `reference.users` indexed per request via a
  `cache`d `userIndex` (the same shape as `supplierIndex` / `customerIndex`),
  and `movementsFor` filters `documents.movements()`.
- `lib/repo/ops.ts` — `notifications()` and `tasks()` returned `db.notifications`
  / `db.tasks` directly. These had no table. Added `notifications` and `tasks`
  to the schema (migration `0008_redundant_blob.sql`) as flat lists with an
  identity `seq` — the inbox is generated newest-first and the task list in
  display order, the seed inserts in array order, `ORDER BY seq` reproduces it.
  `seed.ts` loads them last; both bodies are now one `getDb()` query.

The phase-1 guard is retargeted, not removed. `no-restricted-imports` on
`**/lib/data/store` now applies to `lib/repo/**` again; only `lib/db/seed.ts`
keeps the exemption. Next.js 16 dropped ESLint from `next build`, so the CI
`build` job gained an explicit `npm run lint` step — that is what makes the
guard a build gate.

Guard demonstrated: a temporary `import { db } from "@/lib/data/store"` added
to `lib/repo/ops.ts` fails `npm run lint` with one `no-restricted-imports`
error; removed after.

`grep` for `data/store` across `app`, `components`, `lib`, `hooks` is clean
apart from `lib/db/seed.ts`. `db:seed` green (notifications 12, tasks 12, all
row-count checks pass). All 29 Playwright tests pass unmodified against the
seeded `ci`-style branch.
