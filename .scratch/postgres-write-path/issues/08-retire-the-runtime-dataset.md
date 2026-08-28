# 08: Contract — retire the generated dataset at runtime

**What to build:** The point at which Postgres becomes the only source of data the running application reads. Every repository function queries the database, and nothing in the request path touches the generated dataset.

The generator itself survives, and deliberately so. It remains the source the seed script loads from, which is what keeps the fixed seed — and therefore every recorded Playwright assertion, and ADR-0010's daily demo reset — working. What ends here is its role at runtime, not its existence.

The guard established in phase 1 is retargeted rather than removed: instead of confining the dataset to the repository layer, it now confines it to the seed. Any import of the generator from a repository function or a request path fails the build.

This is the gate before any write work begins. Until it is done, a write updating a projection could sit behind a screen still reading from memory — two live sources of truth, and a write that appears to do nothing.

**Blocked by:** 02, 03, 04, 05, 06, 07 (all read tickets).

**Status:** ready-for-agent

- [ ] No repository function reads the generated dataset
- [ ] Nothing in the request path imports the generator
- [ ] The seed script remains the generator's only consumer
- [ ] The build fails on any import of the generator from outside the seed
- [ ] The guard is demonstrated failing on a deliberately added violating import, which is then removed
- [ ] The Playwright suite passes unmodified against a seeded database
