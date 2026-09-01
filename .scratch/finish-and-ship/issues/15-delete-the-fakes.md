# 15: Delete every surface that cannot do what it offers

**What to build:** Removal of the screens, buttons and tables that exist only to look like a feature, and one small real feature in place of the largest group of them.

A button that lies is worse than a missing button. A visitor who clicks "Resync" and gets a success toast that changed nothing has learned that the application is a mockup, and one such click is enough to reframe everything else they saw. There are twenty-six of them.

**Deleted:**

- `admin/integrations/*` and its nav entry. It configures third-party connections to systems that do not exist.
- `settings/api/*`. API keys for an API that was never built; ADR-0005 keeps the door open to a REST layer and walking through it is future work.
- `admin/automation/new/*`, the rule builder. ADR-0008 leaves the trigger, condition and action vocabulary undefined and phase 2 put it out of scope, so a builder can only produce rules that cannot execute. The rule list and detail pages stay: they read real rows and real run history.
- `settings/{inventory,warehouses,products,notifications,security}`. Each configures values that either live elsewhere already — reorder points are per-Product and read by `healthOf`, warehouses have their own CRUD — or configure nothing.
- `app/(app)/tasks/*` and its nav entry. A seeded to-do list that nothing generates and nothing completes; it can only ever be stale.
- Every `ActionButton` usage with no implementation behind it.

**Dropped from the schema and the seed:** `integrations` and `tasks`. A table nothing reads is a claim in the schema that the system does something it does not.

**Built:** the `ActionButton`s labelled export become a real CSV download — a `Response` with `text/csv` built from the rows the screen already has. It is the only one of the twenty-six with an honest implementation short enough to belong in a deletion ticket.

**Also built:** the Automation Rule `enabled` toggle, wired for real. It is one boolean column that `runAutomation` already honours, and it makes the automation screen operable without a rule language existing.

**Blocked by:** 14 (the import wizard writes what it validates).

**Status:** open

- [ ] Every screen in the deleted list is removed, along with its nav entries and its route files
- [ ] `integrations` and `tasks` are dropped from the schema, the seed and the generated dataset, by migration
- [ ] No `ActionButton` remains that has nothing behind it; the component itself goes if nothing uses it
- [ ] Export actions produce a real CSV download of the rows on screen
- [ ] An Automation Rule can be enabled and disabled, through a permission-checked domain function, and `runAutomation` honours it
- [ ] Playwright assertions covering deleted screens are removed, not skipped
- [ ] The suite passes, `tsc` and `eslint` are clean, and no dead import or unreferenced component is left behind
