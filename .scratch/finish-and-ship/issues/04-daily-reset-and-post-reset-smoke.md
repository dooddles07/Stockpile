# 04: The daily reset, and a smoke test against the live instance

**What to build:** A scheduled workflow that truncates and re-seeds the production database once a day, then runs the Playwright smoke spec against the production URL to prove the instance came back up correctly.

ADR-0010 specified this as an authenticated HTTP endpoint called by a scheduled workflow, and required that endpoint to hold a secret, refuse ordinary sessions, and be treated as the single most dangerous route in the application. It does not need to exist. The workflow can run `npm run db:seed` directly against the production connection string, exactly as CI already does against the `ci` branch every push. That deletes a route, a secret comparison and the entire attack surface, and changes nothing else. **This amends ADR-0010** (see ticket 17); the reasoning in that ADR for truncate-and-reseed over a Neon branch reset or selective deletion is unaffected and stands.

The smoke run afterwards is the point of ADR-0009 applied to deployment. The reset is the one mechanism that destroys the demo silently — a seed that half-fails leaves the URL up and the data wrong, and nothing would report it. Because the seed is deterministic from a fixed generator seed, the recorded assertions in `e2e/smoke.spec.ts` hold against production exactly as they hold against `ci`. Only the smoke spec runs: the write specs would leave the demo in a state the reset did not produce.

**Blocked by:** 03 (migrations reach production with the deploy that needs them).

**Status:** open

- [ ] A scheduled workflow runs `npm run db:seed` against the production branch once a day
- [ ] It can also be triggered manually (`workflow_dispatch`) for a reset on demand
- [ ] Immediately after seeding, `e2e/smoke.spec.ts` runs against the production URL and the workflow fails if it fails
- [ ] The write specs are not run against production
- [ ] No HTTP reset endpoint is added, and ADR-0010 is amended to say why
- [ ] A manual run is performed and observed end to end before the ticket closes
