# 14: Transfer between Warehouses

**What to build:** Stock moves from one Warehouse to another. Dispatching a Transfer lowers on-hand at the source and puts the quantity in transit; receiving it at the destination raises on-hand there and clears the in-transit balance.

This is the only Document with two ends, and the only flow where one logical operation touches two Stock Rows. Both ends of a dispatch must move together or not at all: stock that has left the source but was never recorded as in transit has vanished from the system. The choke point takes a lock per Stock Row, so a Transfer takes two, and they must be acquired in a consistent order across every flow that locks more than one row — otherwise two concurrent transfers between the same pair of Warehouses can deadlock.

Dispatching appends a transfer-out Movement at the source. Receiving appends a transfer-in Movement at the destination. In transit is derived from open Transfer state, not written directly.

A Transfer in flight is a real state that can persist for days, and stock in it belongs to neither end's on-hand. Reporting must reflect that rather than double-counting or losing it.

**Blocked by:** 09 (The choke point and the Event stream).

**Status:** ready-for-agent

- [ ] Dispatching lowers on-hand at the source and places the quantity in transit
- [ ] Receiving raises on-hand at the destination and clears the in-transit balance
- [ ] Both ends of a dispatch commit together or not at all
- [ ] Locks on multiple Stock Rows are acquired in a consistent order, documented where the choke point is used
- [ ] Two concurrent transfers between the same pair of Warehouses do not deadlock, and this is covered by a test
- [ ] In transit is derived from open Transfer state, never written directly
- [ ] Stock in transit is counted at neither end's on-hand
- [ ] End-to-end coverage exists for dispatch, receipt, and the in-flight state in between
