---
status: accepted
---

# Stock and Documents are event-sourced; Reference Data is not

Movements, stock balances, and every Document with a state machine (Purchase Order, Sales Order, Transfer, Adjustment, Stock Count, Return, Goods Receipt) are event-sourced: events are the source of truth and Stock Rows and Document states are projections. Reference Data (Product, Category, Warehouse, Location, Supplier, Customer, Role, settings) is stored as ordinary mutable rows.

The boundary is a single test: **does it move quantity or advance a state machine?** Stock corrections and cancelled orders are exactly the things people later demand an audit trail for; a warehouse's address change is not.

## Considered options

Whole-system event sourcing was rejected because roughly fifteen ordinary edit screens would each gain an event type, a projection, and a rebuild path with no audit value in return. Event-sourcing the stock ledger alone was rejected because it leaves the Documents that *cause* stock changes without history, which is where the interesting questions actually are ("why was this PO cancelled twice?").

## Consequences

Two persistence styles coexist in one codebase, so the boundary must stay explicit and defended. Reserved, incoming, and inTransit are not derivable from Movements — no movement type produces them — so those three balances are projected from open Document state while onHand and damaged are projected from the Movement stream.
