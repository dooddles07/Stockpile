# 02: Expand — complete async repository surface

**What to build:** Every read the application performs becomes available as an asynchronous repository function, under the name that function will keep permanently. Nothing consumes the new surface yet and no behavior changes; this ticket exists so that the migration tickets have somewhere to migrate to.

This is the expand half of an expand–contract sequence. The existing synchronous repository functions are temporarily renamed with a `Sync` suffix and left in place, so every current caller keeps working untouched and the build stays green. Ticket 10 deletes them, leaving the clean names in place.

Three things are corrected while building the new surface, because they are exactly what the database swap in phase 2 cannot do cheaply afterwards:

Reads that screens currently perform inline against the dataset object graph get proper repository functions. Some screens bypass the repository layer entirely today, and every one of those reads needs a home before its screen can be migrated.

Derived values — availability, stock health, and similar computations — move behind the seam. Today two screens can compute the same number in two places; after this they cannot.

Functions are screen-shaped. A function serving one screen returns everything that screen needs in a single call, rather than the screen making several calls and joining the results itself. This matters concretely: in phase 2 each such function becomes one query, and a screen making five repository calls becomes a screen making five round trips to Postgres.

Signatures accept and return the domain types the application already declares, so phase 2 replaces bodies only. Pure computation that takes no dataset input — formatting, comparison, sorting predicates, health classification given explicit arguments — stays synchronous; making it async would be noise phase 2 has no use for.

**Blocked by:** 01 (Playwright harness and recorded baseline).

**Status:** ready-for-agent

- [ ] Every read performed anywhere in the application is available as an async repository function
- [ ] Reads currently done inline by screens against the dataset have repository functions covering them
- [ ] Derived values such as availability and stock health are computed inside the repository layer
- [ ] Functions serving a single screen return everything that screen needs in one call
- [ ] Signatures use the existing domain types; only bodies will change in phase 2
- [ ] Existing synchronous functions are renamed with a `Sync` suffix and still work
- [ ] Pure computation taking no dataset input remains synchronous
- [ ] No caller has been migrated yet — this ticket changes no behavior
- [ ] Typecheck and build pass; the baseline suite from ticket 01 still passes
