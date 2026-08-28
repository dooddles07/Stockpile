# 15: Stock Count completion

**What to build:** A warehouse operator works through a count sheet entering what is physically on the shelf, completes the count, and the system reconciles itself to reality — appending a count-correction Movement for every line where the counted quantity differs from the recorded one.

This is the flow where the system admits it was wrong, so the record of the correction matters more than the correction itself. Each variance produces its own Movement with the counted and expected quantities visible, so the ledger explains what changed and by how much rather than showing an unexplained jump.

A count with no variances appends nothing. Recording zero-quantity corrections would pollute the ledger with non-events.

Counted quantities are entered over time and the count is completed as one operation. The corrections apply together: a count that fails partway through must leave no corrections at all, or the shelf and the system disagree in a new way that nobody knows about.

The count sets the last-counted timestamp on the Stock Rows it touched, which is what tells an inventory manager where to count next.

**Blocked by:** 09 (The choke point and the Event stream).

**Status:** ready-for-agent

- [ ] Completing a count appends a count-correction Movement for each line with a variance
- [ ] Lines with no variance append nothing
- [ ] Each correction records both the counted and the expected quantity
- [ ] All corrections in one count apply together or not at all
- [ ] The last-counted timestamp is set on the Stock Rows the count covered
- [ ] Corrections are attributed to the Actor who completed the count
- [ ] A user whose Role forbids completing counts is refused even when reaching the action directly
- [ ] End-to-end coverage exists for a count with variances, a count with none, and a permission refusal
