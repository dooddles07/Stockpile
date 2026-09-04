import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeftRight,
  BarChart3,
  ClipboardCheck,
  Code2,
  Package,
  ShieldCheck,
  Warehouse,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db/client";
import { companySettings } from "@/lib/domain/settings";
import { cn } from "@/lib/utils";
import { HeroHeading } from "@/components/landing/hero-heading";
import { AnimatedMetrics } from "@/components/landing/animated-metrics";
import { FadeIn } from "@/components/landing/fade-in";

export const dynamic = "force-dynamic";

const loadCompany = cache(() => companySettings(getDb()));

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await loadCompany();
  return { title: companyName, openGraph: { title: companyName, siteName: companyName } };
}

const LEDGER: { ts: string; sku: string; type: string; site: string; qty: string; pos: boolean }[] = [
  { ts: "moments ago", sku: "BCL-SCN-104", type: "Receipt",    site: "SEA-01", qty: "+240", pos: true  },
  { ts: "4m ago",      sku: "TRK-HDL-207", type: "Shipment",   site: "LAX-02", qty: "−85",  pos: false },
  { ts: "11m ago",     sku: "PCK-LFT-031", type: "Transfer",   site: "ORD-03", qty: "+120", pos: true  },
  { ts: "18m ago",     sku: "BCL-SCN-104", type: "Count adj.", site: "SEA-01", qty: "−3",   pos: false },
  { ts: "26m ago",     sku: "SHF-RCK-088", type: "Shipment",   site: "DFW-04", qty: "−200", pos: false },
  { ts: "41m ago",     sku: "TRK-HDL-207", type: "Receipt",    site: "PHX-05", qty: "+500", pos: true  },
  { ts: "1h ago",      sku: "PCK-LFT-031", type: "Adjustment", site: "LAX-02", qty: "+8",   pos: true  },
  { ts: "1h 12m ago",  sku: "SHF-RCK-088", type: "Return",     site: "ORD-03", qty: "+14",  pos: true  },
];

const CAPABILITIES: { icon: typeof Package; title: string; detail: string }[] = [
  {
    icon: Package,
    title: "Full lifecycle tracking",
    detail: "Purchase order through receipt, storage, pick, pack, and shipment. Every state change is an auditable event.",
  },
  {
    icon: ArrowLeftRight,
    title: "Multi-site transfers",
    detail: "Move stock between warehouses with automatic quantity reconciliation. Both sides settle in the same transaction.",
  },
  {
    icon: ClipboardCheck,
    title: "Cycle counts and adjustments",
    detail: "Count stock against expected quantities. Discrepancies post as signed adjustments with full audit context.",
  },
  {
    icon: ShieldCheck,
    title: "Role-enforced permissions",
    detail: "Seven roles drive server-side checks on every write. The UI adapts, but the guard is below it.",
  },
  {
    icon: BarChart3,
    title: "Operational analytics",
    detail: "Inventory valuation, turnover rates, supplier performance, and fulfilment metrics. All derived from the movement stream.",
  },
  {
    icon: Warehouse,
    title: "Location-level granularity",
    detail: "Zones, aisles, racks, and bins. Stock is never just \"in the warehouse\" — it has an address.",
  },
];

const EXPLORE = [
  {
    step: "01",
    title: "Raise a purchase order, then receive it",
    detail: "New purchase order, save, Receive tab. Stock level and movement ledger both update in the same transaction.",
    href: "/purchasing/purchase-orders/new",
  },
  {
    step: "02",
    title: "Watch the ledger reconcile",
    detail: "Every stock change is append-only. The on-hand total is rebuilt from the stream, so it cannot disagree with history.",
    href: "/inventory/movements",
  },
  {
    step: "03",
    title: "Switch role to Auditor",
    detail: "The role switcher lives in the top bar. As Auditor, every write route disappears — enforced server-side.",
    href: "/dashboard",
  },
  {
    step: "04",
    title: "Open the handheld surface",
    detail: "A purpose-built operator shell for lookup, scanning, and receiving. Same permission engine, designed for warehouse use.",
    href: "/operator",
  },
];

const PRINCIPLES = [
  {
    label: "One choke point",
    detail: "Every stock change commits through one function that locks the row, appends the event, and updates the projection atomically.",
  },
  {
    label: "Automation after commit",
    detail: "Rules evaluate in-process when an event lands. No scheduler. Every run is attributable and can fail without rolling back the triggering write.",
  },
  {
    label: "Zero recurring cost",
    detail: "Neon Postgres and Vercel free tiers, no paid scheduler or queue — the constraint that shaped most of the architecture.",
  },
];

export default async function LandingPage() {
  const { companyName } = await loadCompany();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      >
        Skip to content
      </a>

      {/* ── Nav ── */}
      <nav aria-label="Main" className="sticky top-0 z-20 border-b bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Package className="size-4" aria-hidden />
            </span>
            <span className="font-heading text-[15px] font-semibold tracking-tight">{companyName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="https://github.com/dooddles07/Stockpile"
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:flex"
            >
              <Code2 className="size-3.5" aria-hidden />
              GitHub
            </Link>
            <Button size="sm" className="h-8 text-[13px]" render={<Link href="/dashboard" />}>
              Enter the app
            </Button>
          </div>
        </div>
      </nav>

      <main id="main-content">
        {/* ── Hero ── */}
        <section className="mx-auto max-w-6xl px-6 pb-10 pt-16 sm:pb-16 sm:pt-24">
          <div className="grid items-start gap-12 lg:grid-cols-[1fr_480px] lg:gap-16">
            <div className="max-w-xl">
              <FadeIn>
                <p className="mb-5 inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-[12px] font-medium text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-status-info" aria-hidden />
                  Public demo · resets daily
                </p>
              </FadeIn>
              <HeroHeading />
              <FadeIn delay={0.2}>
                <p className="mt-5 text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]">
                  Purchase order to shelf to shipment — one movement ledger,
                  role-based permissions, and a full audit trail across every site.
                </p>
              </FadeIn>
              <FadeIn delay={0.3}>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    className="h-11 px-6 text-[15px]"
                    render={<Link href="/dashboard" />}
                  >
                    Enter the app
                    <ArrowRight className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-11 px-6 text-[15px]"
                    render={<Link href="https://github.com/dooddles07/Stockpile" target="_blank" rel="noreferrer" />}
                  >
                    <Code2 className="size-4" aria-hidden />
                    View source
                  </Button>
                </div>
                <p className="mt-5 text-[13px] text-muted-foreground">
                  Writes are real — creates, receives, and adjustments commit to Postgres.
                  Everyone shares one account. Database resets once a day.
                </p>
              </FadeIn>
            </div>

            {/* Ledger preview */}
            <FadeIn delay={0.15}>
              <div className="w-full overflow-hidden rounded-lg border bg-surface shadow-md">
                <div className="flex items-center justify-between border-b bg-surface-sunken px-3 py-2.5">
                  <span className="text-[12px] font-semibold text-muted-foreground">
                    Movement ledger
                  </span>
                  <span className="text-[11px] text-muted-foreground">6 sites · live</span>
                </div>
                <div className="overflow-x-auto">
                  <table
                    className="w-full text-[12px]"
                    aria-label="Sample movement ledger"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    <thead>
                      <tr className="border-b">
                        {["Time", "SKU", "Type", "Site", "Qty"].map((h) => (
                          <th
                            key={h}
                            scope="col"
                            className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {LEDGER.map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-muted-foreground">{row.ts}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-foreground">{row.sku}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-[11px] text-muted-foreground">{row.type}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-muted-foreground">{row.site}</td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-3 py-2 font-mono text-[11px] font-semibold",
                              row.pos ? "text-status-success" : "text-status-danger",
                            )}
                          >
                            {row.qty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t bg-surface-sunken px-3 py-2">
                  <Link
                    href="/inventory/movements"
                    className="text-[11px] font-medium text-brand transition-colors hover:text-brand/80"
                  >
                    Open the full ledger
                  </Link>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ── Animated metrics strip ── */}
        <AnimatedMetrics />

        {/* ── Capabilities ── */}
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <FadeIn>
            <div className="max-w-xl">
              <h2 className="font-heading text-[24px] font-bold tracking-tight sm:text-[28px]">
                Everything an operations team needs
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
                One system for procurement, warehousing, fulfilment, and audit — no integrations, no sync jobs.
              </p>
            </div>
          </FadeIn>
          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((cap, i) => (
              <FadeIn key={cap.title} delay={i * 0.08}>
                <div className="group">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-brand-subtle text-brand">
                    <cap.icon className="size-5" aria-hidden />
                  </div>
                  <p className="text-[15px] font-semibold text-foreground">{cap.title}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{cap.detail}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ── Explore ── */}
        <section className="border-t bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
            <FadeIn>
              <div className="max-w-xl">
                <h2 className="font-heading text-[24px] font-bold tracking-tight sm:text-[28px]">
                  What to explore
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
                  Four paths into the system, each exercising a different design principle.
                </p>
              </div>
            </FadeIn>
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {EXPLORE.map((item, i) => (
                <FadeIn key={item.href} delay={i * 0.08}>
                  <Link
                    href={item.href}
                    className="group flex gap-4 rounded-lg border bg-background p-5 transition-colors hover:border-brand/30 hover:bg-background"
                  >
                    <span className="shrink-0 font-heading text-[28px] font-bold leading-none text-border-strong transition-colors group-hover:text-brand/40">
                      {item.step}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold leading-snug text-foreground transition-colors group-hover:text-brand">
                        {item.title}
                      </p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{item.detail}</p>
                      <span aria-hidden className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-brand">
                        Go
                        <ArrowRight
                          className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                        />
                      </span>
                    </div>
                  </Link>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ── Architecture principles ── */}
        <section className="border-t">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
            <FadeIn>
              <div className="max-w-xl">
                <h2 className="font-heading text-[24px] font-bold tracking-tight sm:text-[28px]">
                  Under the hood
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
                  The decisions worth reading if you're in the source.
                </p>
              </div>
            </FadeIn>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {PRINCIPLES.map((note, i) => (
                <FadeIn key={note.label} delay={i * 0.1}>
                  <div className="rounded-lg border bg-surface p-5">
                    <p className="text-[14px] font-semibold text-foreground">{note.label}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{note.detail}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="border-t bg-surface-sunken">
          <div className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-20">
            <FadeIn>
              <h2 className="font-heading text-[24px] font-bold tracking-tight sm:text-[32px]">
                See the whole system working
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
                The demo is fully writable. Create purchase orders, receive stock, ship orders, and watch the ledger reconcile in real time.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button
                  size="lg"
                  className="h-11 px-6 text-[15px]"
                  render={<Link href="/dashboard" />}
                >
                  Enter the app
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11 px-6 text-[15px]"
                  render={<Link href="https://github.com/dooddles07/Stockpile" target="_blank" rel="noreferrer" />}
                >
                  <Code2 className="size-4" aria-hidden />
                  View source
                </Button>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-[13px] text-muted-foreground">
            <span>Built with Next.js, Drizzle, and Neon Postgres.</span>
            <Link
              href="https://github.com/dooddles07/Stockpile"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              github.com/dooddles07/Stockpile
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
