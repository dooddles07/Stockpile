---
version: 1
slug: "app"
primary_target: "app"
related_targets: []
---

## Surface

Whole app visual system — every screen, component, and state.

## Mode

Operate

## Audience

Desktop managers (dual monitors), floor operators (tablets), ops directors (remote laptops). Task-oriented, arriving in work mode.

## Job

Replace Industrial Slate with a unified visual system at Stripe + Vercel craft level. Category standard arrangement — sidebar, cards, tables — distinguished by typographic precision, data clarity, interaction polish, and consistent density.

## Benchmarks

- **Stripe Dashboard**: warm neutrals, data hierarchy through weight and spacing, pill status indicators, polished micro-interactions
- **Vercel Console**: black-and-white confidence, typographic scale contrast, sharp borders, speed in every transition

## Direction contract

THESIS: The category standard for inventory SaaS, executed at Stripe and Vercel craft level. Distinguished not by novelty but by precision — every pixel earns its position through typographic hierarchy, data clarity, and consistent density. The arrangement everyone ships, at a polish level almost no one reaches.

OWN-WORLD: White surfaces with subtle gray borders (not shadows) as primary container signal. Neutral-900 for headings, neutral-500 for secondary text, neutral-200 for borders. Emerald green brand accent for primary actions and active states only. One type family (Inter) at a disciplined 1.125 ratio scale. Border-defined cards. Restrained color — neutrals plus emerald plus semantic status tones. Light-first with structurally equal dark mode.

STORY: The visitor opens a task tool that feels immediately trustworthy. Every screen uses identical visual vocabulary. Data is clear, actions are obvious, status always visible through dot + text. They never pause to decode the interface — the tool disappears into the task.

FIRST VIEWPORT: Equal-weight KPI strip across the top — no hero card, all metrics carry equal visual weight in a clean grid. Below: widget grid with consistent border-defined cards at one elevation. Three-column on wide screens, single on mobile. Each card: subtle border, compact header with label and count badge, content with real data. Status via pill badges with semantic background tints. No entrance animations on data load.

FORM: Category standard — persistent left sidebar with clean section grouping, sticky top bar with search trigger and role context, scrollable content area. Tables as first-class data display. Seed key 43642a81, canon path, safer register.

FINISH: Unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Anti-goals

- No gradients, glassmorphism, or decorative motion
- No dashboard-as-marketing-page energy
- No entrance animations on data
- No display fonts in UI labels or buttons
- No reinvented affordances for standard interactions

## Open decisions

- Exact neutral palette values (derive from Stripe/Vercel analysis)
- Whether brand accent stays emerald green or shifts
- Sidebar background treatment in dark mode
