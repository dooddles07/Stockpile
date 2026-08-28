# 10: Adjustment and damage, end to end

**What to build:** The first write a user can actually perform. A warehouse operator records an Adjustment with a reason and a quantity, submits it, and sees on-hand change and a Movement appear in the ledger with their name on it. Recording damaged goods works the same way and moves quantity into the damaged balance.

This is the first flow through the choke point, so it establishes the pattern every later write flow copies: a server action validates its input and calls a domain function, the domain function takes the Actor and calls the choke point, and nothing else happens anywhere.

Per ADR-0005 the server action holds no logic. It validates with zod and delegates. An action that looks like a pass-through is correct and should stay that way — a reviewer should not "improve" it.

Authorization is enforced in the domain function, not by the form being hidden. The existing rendering gates stay, but a user whose Role forbids adjustments must be refused even when reaching the action directly.

An Adjustment requires a reason. That is the entire point of the Movement type existing — a discrepancy that is explained rather than silently corrected.

**Blocked by:** 09 (The choke point and the Event stream).

**Status:** ready-for-agent

- [ ] A warehouse operator can record an Adjustment with a reason and see on-hand change
- [ ] The resulting Movement appears in the ledger attributed to the Actor who made it
- [ ] Recording damage moves quantity into the damaged balance
- [ ] The server action validates input and delegates; it contains no business logic
- [ ] A user whose Role forbids the action is refused even when reaching it directly
- [ ] An Adjustment that would drive on-hand below zero is rejected with a clear message
- [ ] End-to-end coverage exists for the successful flow, the permission refusal and the negative-stock rejection
