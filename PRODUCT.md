# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three equally first-class audiences on the same system:

- **Desktop managers** — warehouse and inventory managers planning purchase orders, reviewing stock levels, managing categories, running reports. Desktop browser, often multi-monitor.
- **Floor operators** — warehouse staff receiving goods, picking orders, scanning barcodes, processing transfers. Tablet or rugged handheld via the dedicated operator mode (`/operator`).
- **Operations directors** — senior staff reviewing KPIs across all sites, approving purchase orders and transfers, auditing movements, managing roles and automation rules. Desktop browser, often remote.

## Product Purpose

Stockpile is an inventory operating system for multi-site distributors. It unifies stock accuracy, purchasing, warehousing, fulfillment, and audit into one system so that every number — on hand, committed, in transit, valued — is defensible and traceable back to its source movement.

Success means: an operator can trust the number on screen without calling the warehouse to verify, a manager can approve a purchase order knowing the stock position is current, and an auditor can reconstruct any balance from the movement ledger alone.

## Positioning

Three reinforcing differentiators:

1. **Ledger-first accuracy.** The movement ledger is the single source of truth. Every stock quantity, valuation, and report is reconstructed from ledger entries — not from mutable snapshot fields. Any number on any screen can be traced to the movements that produced it.
2. **Multi-site operations in one view.** Unified dashboard, transfers, receiving, and fulfillment across all warehouses. No per-site logins or data silos — a single operations overview spans every site.
3. **Role-based everything.** Every action is permission-gated and audit-trailed. Built for compliance-heavy distributors where who-did-what-when is not optional.

## Operating Context

- **Workflows:** purchase order lifecycle (draft → approved → ordered → partially received → fully received), warehouse transfers (requested → approved → shipped → received), stock counts (planned → in progress → completed → adjusted), sales order fulfillment (picking → packing → shipped).
- **Environments:** six warehouse sites (NA, EU, APAC regions), daily data resets in the public demo.
- **Key entities:** products (identified by SKU), lots (with expiry tracking), warehouses, locations within warehouses, suppliers, customers, purchase orders, sales orders, transfers, adjustments, stock counts.
- **Approvals:** configurable multi-role approval gates on purchase orders, transfers, adjustments, and counts.
- **Automation:** rule-based triggers for reorder points, notifications, and workflow transitions.

## Capabilities and Constraints

- Full CRUD across inventory, purchasing, sales, warehousing, and admin domains.
- Real-time stock levels with health indicators (healthy, low, critical, out of stock).
- Lot and expiry tracking with 30-day expiry alerts.
- Barcode scanning via operator handheld mode.
- Analytics dashboards: inventory, purchasing, sales, valuation, and warehouse reports.
- CSV/data import for bulk product and stock onboarding.
- Command palette (⌘K) for cross-entity search.
- Notification system with priority levels.
- Audit log for all state-changing operations.
- Constraint: no real auth vendor in the current build — role switching is exercised via a top-bar role selector. The demo resets daily.

## Brand Commitments

- **Name:** Stockpile
- **Design system:** Neutral-based category standard at Stripe + Vercel craft level — semantic tokens only, no gradients, border-defined containers (not shadows), status conveyed via dot-glyph + text (never color alone).
- **Type:** Inter (all text), JetBrains Mono (identifiers: SKU, lot, serial, PO/SO/TR numbers).
- **Palette:** Neutral base, emerald green brand accent (#047857 light / #34d399 dark). Six status tones (neutral, info, success, warning, danger, purple). Six chart colors.
- **Radius:** restrained — max 8px, no pills.
- **Elevation:** flat at rest (borders as container signal), shadows reserved for floating layers only.
- **Identity:** the Package icon in primary color is the app mark.

## Evidence on Hand

- Working public demo with seed data across six warehouse sites.
- Movement ledger with full history reconstructing all stock positions.
- Role permission matrix covering 15+ modules at four access levels (none, view, edit, manage).
- Seed data: ~200 products, multiple suppliers and customers, purchase and sales order history, transfer records, adjustment and count history.
- No real customer testimonials, case studies, or press coverage to reference. Do not fabricate these.

## Product Principles

1. **The ledger is law.** Every displayed number must be derivable from the movement ledger. No mutable cache is authoritative.
2. **Operators first.** If a design decision helps a report but hurts a floor operator scanning at pace, the operator wins.
3. **Show, then explain.** Status is always visible (dot + label), detail is one click away, and nothing requires a manual to understand.
4. **Permission is the product.** Role gates are not a layer on top — they shape what each user sees, and the absence of a feature for a role is deliberate, not a bug.
5. **Boring beats clever.** An inventory system used at 3 AM during a stock take must be predictable, fast, and never surprising.

## Accessibility & Inclusion

- WCAG AA minimum (4.5:1 text contrast, visible focus rings, keyboard navigable).
- `prefers-reduced-motion` respected — all animations disabled.
- Status conveyed by icon + text, never color alone.
- Skip-to-main-content link on every page.
- Tabular numeric formatting for all data columns.
- Operator mode designed for gloved-hand use on rugged handhelds (44×44px minimum touch targets).
