# 09: Migrate the remaining application surface

**What to build:** Everything not covered by the area-specific migration tickets reads its data by awaiting the async repository surface: dashboard, analytics, settings, approvals, tasks, notifications, import, and the application layout. Roughly 10 files.

To a user, nothing changes. The baseline suite demonstrates it.

This ticket ends green on its own and is independent of the other migration tickets.

Two parts of this set deserve attention. The dashboard and analytics screens read across every domain at once, so they exercise more of the repository surface than any single-area screen and are the most likely place for a gap in ticket 02 to surface. The application layout is shared by every screen in the main route group, so a mistake there is visible everywhere rather than on one page.

Permission checks are not touched.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** ready-for-agent

- [ ] No remaining screen or layout imports the generated dataset directly
- [ ] All reads in these areas await the async repository surface
- [ ] Cross-domain figures on the dashboard and analytics screens are unchanged
- [ ] Permission checks are unchanged
- [ ] No visual, behavioral or UX change of any kind
- [ ] Typecheck and build pass
- [ ] The baseline suite from ticket 01 passes unmodified
