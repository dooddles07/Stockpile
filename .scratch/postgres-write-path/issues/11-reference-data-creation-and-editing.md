# 11: Reference data creation and editing

**What to build:** An inventory manager can create and edit the records that describe the business: Products, Categories, Suppliers, Customers, Warehouses and Locations. The forms these screens already have start working.

This is plain CRUD on mutable rows, per ADR-0002. Reference data is not event-sourced — the boundary test is whether something moves quantity or advances a state machine, and a Supplier's payment terms do neither. Do not route these through the choke point, and do not append Events for them. That is why this ticket does not depend on ticket 09 and can run alongside it.

Authorization is still enforced in the domain function with an explicit Actor, exactly as for stock writes. The rule is universal even though the persistence style differs.

Referential integrity is the database's job here. Deleting a Warehouse that holds stock, or a Category with Products in it, must be prevented by a constraint rather than by a check someone remembered to write.

**Blocked by:** 06 (Roles as database rows), 08 (Retire the generated dataset at runtime).

**Status:** ready-for-agent

- [ ] Products, Categories, Suppliers, Customers, Warehouses and Locations can be created and edited
- [ ] These writes are plain row updates; no Events are appended and the choke point is not used
- [ ] Each domain function takes an Actor and enforces permission
- [ ] A user whose Role forbids the action is refused even when reaching it directly
- [ ] Foreign key constraints prevent deleting records that others depend on
- [ ] Server actions validate input and delegate; they contain no business logic
- [ ] End-to-end coverage exists for creating and editing at least one record of each kind, and for a permission refusal
