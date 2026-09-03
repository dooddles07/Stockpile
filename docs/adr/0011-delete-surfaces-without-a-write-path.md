---
status: accepted
---

# Screens without a write path are deleted, not stubbed

A screen that renders real-looking data and offers actions that do nothing teaches a
visitor that the whole application is a mockup. One click of a "Resync" button that
returns a success toast and changes nothing reframes every other screen the visitor
has seen. Ticket 15 removes every such surface rather than leaving it in place behind
a "coming soon" label.

Deleted: the third-party **integrations** admin area, the **API keys** settings page,
the automation **rule builder** (`admin/automation/new` and the `[id]/edit` form that
shared it), five of the seven **settings** pages (`inventory`, `warehouses`,
`products`, `notifications`, `security` — each configured values that live elsewhere
already or configured nothing), the **tasks** screen (a seeded to-do list that nothing
generates and nothing completes), and every `ActionButton` with no implementation
behind it. The `integrations` and `tasks` tables, read by nothing but a deleted
screen, are dropped from the schema, the seed and the generated dataset by migration
in the same ticket.

What survives is smaller and entirely real. The automation **rule list and detail**
pages stay — they read real rows and real run history — and the detail page gains a
working enable/disable toggle (`setRuleEnabled`, permission-checked, honoured by
`runAutomation`) so the screen is operable without a rule language existing (ADR-0008).
The `ActionButton`s labelled *Export* on the screens that have rows became a real
`text/csv` download built from those rows; `settings/company` keeps its own layout.

## Consequences

**This is recorded here because a future reader would otherwise assume the screens
were lost, not removed.** The REST API, API keys and third-party integrations remain
legitimate future work (spec phase 1, out of scope); their *screens* were the problem,
not the idea. ADR-0005 still applies when that work lands.

**The `integrations` permission module key is kept.** It costs nothing, and removing
it would churn every seeded role's permission matrix and the matrix editor for no
functional gain. A permission that grants access to no screen is inert.

**`AppNotification.category` still includes `"integration"`.** One seeded notification
uses it; its `href` was repointed off the deleted route.
