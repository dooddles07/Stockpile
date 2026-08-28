# 08: Migrate operator screens onto the async surface

**What to build:** The operator screens — lookup, scan, receive, approve — read their data by awaiting the async repository surface instead of importing the generated dataset directly. Roughly 4 files.

To a user, nothing changes. The baseline suite demonstrates it.

This ticket ends green on its own and is independent of the other migration tickets.

These screens sit in a separate route group from the main application and are the ones warehouse staff use on the floor, so they are worth confirming individually rather than assuming the main application's coverage reaches them.

Permission checks are not touched.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** ready-for-agent

- [ ] No operator screen imports the generated dataset directly
- [ ] All reads in this area await the async repository surface
- [ ] Permission checks are unchanged
- [ ] No visual, behavioral or UX change of any kind
- [ ] Typecheck and build pass
- [ ] The baseline suite from ticket 01 passes unmodified
