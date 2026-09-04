---
name: Stockpile
description: Inventory operating system for multi-site distributors — ledger-first accuracy at Stripe craft level.
colors:
  background: "#fafafa"
  foreground: "#171717"
  surface: "#ffffff"
  surface-sunken: "#f5f5f5"
  surface-hover: "#fafafa"
  muted-foreground: "#636363"
  brand: "#047857"
  brand-foreground: "#ffffff"
  brand-subtle: "#ecfdf5"
  border: "#e5e5e5"
  border-strong: "#d4d4d4"
  destructive: "#dc2626"
  status-neutral: "#525252"
  status-info: "#1d4ed8"
  status-success: "#047857"
  status-warning: "#b45309"
  status-danger: "#b91c1c"
  status-purple: "#6d28d9"
  chart-1: "#171717"
  chart-2: "#047857"
  chart-3: "#2563eb"
  chart-4: "#d97706"
  chart-5: "#7c3aed"
  chart-6: "#0891b2"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "-0.015em"
  page-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  section:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.429
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.385
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.333
  overline:
    fontFamily: "Inter, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.273
    letterSpacing: "0.06em"
  code:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.44
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "color-mix(in oklch, {colors.foreground}, transparent 20%)"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-sunken}"
  card-default:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  kpi-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  status-badge:
    rounded: "{rounded.sm}"
    height: "20px"
    padding: "0 6px"
  input-default:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
---

# Design System: Stockpile

## Overview

**Creative North Star: "The Precision Instrument"**

Stockpile is a data-dense operational tool that earns trust through typographic clarity, consistent density, and absolute restraint. Every screen uses the same visual vocabulary: white surfaces separated by fine gray borders, a single emerald accent reserved for brand actions and positive status, and a type hierarchy built entirely from Inter at a tight 14px base. The interface disappears into the task because nothing on screen exists to decorate -- every element carries data or receives input.

The system is structurally light-first with a fully resolved dark mode that inverts the neutral scale while preserving the same spatial relationships and accent roles. Depth is communicated almost entirely through border containment rather than shadow; the shadow vocabulary exists but is held to near-imperceptible opacity, used only on elevated overlays (popovers, dropdowns) rather than resting surfaces.

Density is high by design. The base body size is 14px, table and label text drop to 13px, captions to 12px, and overlines to 11px. Row height is fixed at 44px. Padding is compact (16px card padding, 10px widget rows). This is a tool for people who process hundreds of line items daily -- visual economy is a feature.

**Key Characteristics:**
- Single typeface (Inter) across all roles; JetBrains Mono for code only
- Emerald green (#047857) as the sole brand accent, used sparingly
- Border-defined containers with no resting shadows
- Six semantic status tones (neutral, info, success, warning, danger, purple) each with text + background + border triplet
- Status always communicated as dot + text label, never color alone
- Tabular numerals on all data surfaces
- Structurally equal light and dark modes

## Colors

A restrained neutral palette with one deliberate brand accent and six semantic status tones. Color is information, never decoration.

### Primary
- **Emerald Brand** (#047857): Primary actions, active navigation states, success status, and the brand mark. Used on no more than 10% of any viewport. In dark mode shifts to #34d399 for contrast.
- **Brand Subtle** (#ecfdf5): Tinted background for brand-adjacent surfaces (selection highlight, success badge background). In dark mode shifts to #071f17.

### Neutral
- **Foreground** (#171717): All primary text, headings, and the default button fill. Neutral-900 equivalent.
- **Muted Foreground** (#636363): Secondary text, labels, placeholders, timestamps. The workhorse secondary color.
- **Surface** (#ffffff): Card backgrounds, sidebar, top bar. The primary container color.
- **Surface Sunken** (#f5f5f5): Recessed surfaces — table headers, search trigger, count badges, description bars.
- **Surface Hover** (#fafafa): Interactive row hover state.
- **Background** (#fafafa): Page canvas behind all cards.
- **Border** (#e5e5e5): Default container borders, dividers, separators.
- **Border Strong** (#d4d4d4): Hover-state borders, scrollbar thumbs, input borders.

### Semantic Status
Each status tone is a coordinated triplet: text color, tinted background, and border.
- **Neutral** (#525252 / #f5f5f5 / #d4d4d4): Default, inactive, or informational-neutral states.
- **Info** (#1d4ed8 / #eff6ff / #bfdbfe): Informational callouts, unread indicators.
- **Success** (#047857 / #ecfdf5 / #a7f3d0): Healthy stock, completed operations, positive deltas.
- **Warning** (#b45309 / #fffbeb / #fde68a): Low stock, pending approvals, approaching expiry.
- **Danger** (#b91c1c / #fef2f2 / #fecaca): Critical stock, overdue items, negative deltas, destructive actions.
- **Purple** (#6d28d9 / #f5f3ff / #ddd6fe): Reserved stock, special categorization.

### Chart Palette
Six sequential chart colors: Foreground (#171717), Emerald (#047857), Blue (#2563eb), Amber (#d97706), Violet (#7c3aed), Cyan (#0891b2). In dark mode these shift to lighter variants for contrast on dark backgrounds.

### Named Rules
**The One Accent Rule.** Emerald is the only chromatic accent in the neutral palette. Every other hue is a semantic status tone earned by data state, never applied for visual variety.

**The Triplet Rule.** Every status color ships as three tokens (text, background, border). A status badge or pill always uses all three. Using a status hue without its triplet is a bug.

## Typography

**Display Font:** Inter (with system sans-serif fallback)
**Mono Font:** JetBrains Mono (code blocks, SKU displays)

**Character:** A single-family system optimized for data density. Inter carries every role from 24px display headings down to 11px overlines. The hierarchy is built through weight (400-600) and tracking (tight on headings, wide on overlines), not through typeface contrast.

### Hierarchy
- **Display** (600, 24px, 32px line-height, -0.015em): Dashboard metric values (`.text-metric`) and page-level display headings (`.text-display`).
- **Page Title** (600, 20px, 28px, -0.01em): Top-level page headings like "Operations overview" (`.text-page-title`).
- **Section** (600, 16px, 24px, -0.01em): Section headings within a page (`.text-section`).
- **Card Title** (600, 14px, 20px): Card and widget header labels (`.text-card-title`).
- **Body** (400, 14px, 20px): Default text, descriptions, widget row content. The root `<body>` size.
- **Label** (500, 13px, 18px): Table cell text, form labels, widget row titles (`.text-label`, `.text-table`).
- **Caption** (400, 12px, 16px): Timestamps, secondary metadata, helper text (`.text-caption`).
- **Overline** (600, 11px, 14px, 0.06em, uppercase): KPI labels, table column headers, section overlines (`.text-overline`).
- **Code** (JetBrains Mono, 400, 12.5px, 18px): Inline code, reference numbers (`.text-code`).

### Named Rules
**The No Second Face Rule.** Inter is the only display and body typeface. JetBrains Mono appears exclusively in code contexts. No other font is loaded or referenced.

**The Tabular Numbers Rule.** Every numeric data surface — tables, KPI values, delta badges, monetary amounts — uses `font-variant-numeric: tabular-nums`. Numbers must column-align without monospace.

## Layout

The app shell is a fixed three-region layout: persistent left sidebar (16rem expanded, 3rem collapsed), sticky top bar (56px / h-14), and a scrollable content area.

Content uses a consistent spacing rhythm: 16px (p-4) padding at mobile, 24px (p-6 / sm:p-6) at wider viewports. Vertical section spacing is 24px (space-y-6).

The KPI strip is a responsive grid: single column on mobile, 2 columns at `sm`, 4 columns at `xl`, with 12px (gap-3) gutters. Widget and chart grids use 16px (gap-4) gutters, typically 3 columns at `lg` breakpoint, single column on mobile.

Full-width widget cards (like "Recent inventory activity") span all 3 columns via `span: 3`. The customizable grid lets users reorder panels.

Row height for table rows and dense list items is 44px (`--row-h: 44px`). Widget rows use compact 10px vertical padding (py-2.5) with 16px horizontal (px-4).

## Elevation & Depth

This is a border-first system. Resting surfaces are flat — cards use `ring-1 ring-foreground/10` (a 10% opacity outline) as their container signal, not box-shadow. The sidebar and top bar use `border-b` / `border-r` for edge definition.

Shadows exist in the token scale but are held to near-imperceptible opacity (3-8% black). They appear only on elevated overlays: dropdown menus, popovers, command palette, and sheet panels. No resting card or widget uses a shadow.

### Shadow Vocabulary
- **2xs/xs/sm** (`0 1px 2px 0 rgb(0 0 0 / 0.03-0.04)`): Subtle edge definition on small overlays.
- **md/lg** (`0 4px 12px -4px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)`): Dropdown menus, popovers.
- **xl** (`0 8px 24px -6px rgb(0 0 0 / 0.12), 0 4px 8px -4px rgb(0 0 0 / 0.06)`): Command palette, sheet overlays.

### Named Rules
**The Flat-at-Rest Rule.** Surfaces are flat by default. Shadows appear only on overlays that float above the page plane (popovers, dropdowns, sheets). A card on the page grid never has a shadow.

## Shapes

The corner language is restrained and capped. The radius scale runs sm (4px), md (6px), lg (8px), and then every larger step (xl through 4xl) is capped at the same 8px maximum. This prevents runaway rounding on larger surfaces.

- **Cards and inputs:** Gently rounded (8px / rounded-lg).
- **Status badges:** Slightly squared (4px / rounded-sm) to feel like data labels, not pills.
- **Summary pills and delta badges:** Fully rounded (rounded-full / 9999px) for small inline indicators.
- **Buttons:** Gently rounded (8px / rounded-lg), with smaller sizes using slightly tighter radii.
- **Scrollbar thumbs:** Fully rounded.

Borders are the primary containment signal. Cards use a 1px ring at 10% foreground opacity. Status badges use their triplet border color. Inputs use `border-input` (#d4d4d4) at rest, shifting to `border-ring` on focus.

## Components

### Buttons
- **Shape:** Gently rounded (8px), 32px default height.
- **Primary:** Foreground fill (#171717) with white text. Hover reduces opacity to 80%. Focus: ring border + 3px ring at 50% ring color.
- **Outline:** White background with border, hover shifts to muted background.
- **Ghost:** Transparent at rest, muted background on hover. Used for icon buttons in top bar and widget actions.
- **Destructive:** 10% destructive background tint with destructive text. Hover intensifies to 20%.
- **Sizes:** xs (24px), sm (28px), default (32px), lg (36px). Icon-only variants at matching heights.

### Cards / Containers
- **Corner Style:** Gently rounded (8px / rounded-xl on the Card primitive, rounded-lg on KPI cards).
- **Background:** Surface white (#ffffff).
- **Shadow Strategy:** None at rest. Container signal is `ring-1 ring-foreground/10`.
- **Border:** 10% foreground ring. Widget cards add an explicit bottom border on header rows.
- **Internal Padding:** 16px default (`--card-spacing`), 12px for small variant.

### KPI Cards
- **Shape:** Rounded-lg border, surface background, 16px padding.
- **Label:** 12px uppercase with wide tracking, muted-foreground color.
- **Value:** `.text-metric` (24px, 600 weight, tabular-nums, -0.02em tracking).
- **Delta badge:** Rounded-full pill with status-tinted background (success-bg or danger-bg) and matching text. Includes trend icon (TrendingUp/TrendingDown).
- **Sparkline:** Optional SVG area chart, 32px tall, status-toned stroke.
- **Hover (when linked):** Border strengthens to border-strong, background shifts to surface-hover. Arrow icon slides in.

### Status Badges
- **Style:** Rounded-sm (4px) container with triplet coloring: tinted background, matching text, matching border.
- **Dot:** Colored circle (6px sm, 8px md) always present by default, matching the tone.
- **Sizes:** sm (20px height, 11px text) and md (24px height, 12px text).
- **Rule:** Status is never color alone. Every badge carries a dot glyph and text label.

### Inputs / Fields
- **Style:** Transparent background, border-input (#d4d4d4) stroke, rounded-lg (8px), 32px height, 14px text (13px on md+).
- **Focus:** Border shifts to ring color, gains 3px ring at 50% ring opacity.
- **Error:** Border shifts to destructive, ring shifts to destructive at 20%.
- **Disabled:** 50% opacity, input background at 50%, no pointer events.

### Navigation (Sidebar)
- **Width:** 16rem expanded, 3rem collapsed (icon-only), 18rem on mobile (sheet overlay).
- **Background:** Surface white, matching the card surface.
- **Text:** Muted foreground (#404040 sidebar-foreground) at rest.
- **Active state:** Muted background (#f5f5f5) with foreground text.
- **Border:** Right edge border matching the standard border color.
- **Keyboard shortcut:** `B` to toggle.

### Widget Cards
- **Header:** Flex row with card-title heading + optional count badge (sunken background, 11px semibold) + "View all" link with arrow icon.
- **Description bar:** Optional, sunken background, caption text.
- **Content:** Zero padding on CardContent; rows handle their own padding.
- **Widget rows:** 13px medium text, 10px vertical padding, 16px horizontal, hover shifts to surface-hover when linked. Leading/trailing slots for icons, badges, and amounts.

### Top Bar
- **Height:** 56px (h-14), sticky at top, z-30.
- **Background:** Surface white with bottom border.
- **Search trigger:** Faux input with sunken background, muted text, keyboard shortcut badge. Opens command palette.
- **Controls:** Ghost icon buttons (32px), role switcher (outline button), avatar with dropdown.

## Do's and Don'ts

### Do:
- **Do** use the status triplet (text + bg + border) whenever showing a status indicator. Dot + label is mandatory.
- **Do** apply `tabular-nums` on every numeric data surface: tables, KPI cards, delta badges, monetary values.
- **Do** use border/ring as the primary container signal. Cards use `ring-1 ring-foreground/10`.
- **Do** keep the emerald brand accent under 10% of any viewport. It marks primary actions and positive status only.
- **Do** provide a text-accessible alternative for every visual indicator (sparklines are `aria-hidden`, icons carry labels or are decorative).
- **Do** respect `prefers-reduced-motion` -- the build disables all animation and transition when the preference is set.

### Don't:
- **Don't** add box-shadows to resting cards or surfaces. Shadows are reserved for floating overlays (popovers, dropdowns, sheets, command palette).
- **Don't** introduce a second typeface for display or heading use. Inter is the only non-monospace font.
- **Don't** use color alone to communicate status. Every status needs a dot glyph and a text label alongside its color.
- **Don't** use entrance animations on data load. Data appears immediately; animation is reserved for state transitions (hover, focus, expand/collapse).
- **Don't** exceed 8px border-radius on any surface. The radius scale is intentionally capped.
- **Don't** use status colors decoratively. Each status hue is earned by a data state (healthy, warning, critical, etc.), never applied for visual variety.
