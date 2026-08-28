# Stockpile

An inventory management system for a single business: one deployment, one company's stock, tracked across warehouses from supplier receipt through to customer fulfilment.

## Language

### Stock

**Movement**:
A single recorded change to the quantity of one Product at one Location. Every quantity change in the system is a Movement; the nine movement types (`purchase-receipt`, `sale`, `transfer-out`, `transfer-in`, `adjustment`, `return-in`, `return-out`, `damage`, `count-correction`) name the reason it happened.
_Avoid_: transaction, entry, stock change

**Stock Row**:
The current balances for one Product at one Location, projected from Movements and open Documents. Holds five balances: `onHand`, `reserved`, `damaged`, `incoming`, `inTransit`.
_Avoid_: stock level, inventory record, quantity

**On Hand**:
Physically present and countable at a Location. Derived from Movements.
_Avoid_: available, in stock

**Reserved**:
On-hand quantity already promised to an open Sales Order and therefore not sellable. Derived from open Documents, never from Movements.
_Avoid_: allocated, committed

**Incoming**:
Quantity on an open Purchase Order that has not yet been received. Derived from open Documents.
_Avoid_: on order, expected

**In Transit**:
Quantity that has left a source Location on an open Transfer and not yet arrived at its destination. Derived from open Documents.
_Avoid_: in flight, moving

**Location**:
The addressable place within a Warehouse where stock physically sits. Stock balances are held per Location, not per Warehouse.
_Avoid_: bin, slot, shelf

**Warehouse**:
A physical site containing Locations.
_Avoid_: site, facility, depot

### Documents and reference data

**Document**:
Any record with a state machine that causes or anticipates Movements: Purchase Order, Sales Order, Transfer, Adjustment, Stock Count, Return, Goods Receipt. Documents are event-sourced.
_Avoid_: order, record, transaction

**Reference Data**:
Records that describe the business rather than its activity: Product, Category, Warehouse, Location, Supplier, Customer, Role, settings. Reference Data is stored as ordinary mutable rows, not event-sourced.
_Avoid_: master data, lookup, config

**Product**:
A distinct sellable or stockable item, identified by its SKU.
_Avoid_: item, SKU (the SKU is the identifier, not the thing), article

**Event**:
An immutable record that something happened to a Document or to stock. Events are the source of truth for the event-sourced part of the system; Stock Rows and Document states are projections of them.
_Avoid_: message, log entry, action

**Projection**:
A queryable view built by applying Events in order. Stock Rows and Document states are Projections; they can always be rebuilt from the Event stream and are never authoritative on their own.
_Avoid_: read model, cache, view

### People and rules

**Actor**:
The user on whose authority a change is made. Every change records its Actor, and automation acts as a designated system Actor rather than as no one.
_Avoid_: author, operator, principal

**Role**:
A named set of permissions granted to Users, editable at runtime. A User has exactly one Role.
_Avoid_: group, permission set, access level (an access level is one entry within a Role)

**Automation Rule**:
A stored rule that reacts to an Event by evaluating conditions and, if they hold, taking actions. Its trigger, condition and action vocabulary is not yet defined.
_Avoid_: workflow, trigger (a trigger is one part of a Rule), job
