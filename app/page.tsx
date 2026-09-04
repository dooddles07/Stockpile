import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { ArrowRight, Code2, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db/client";
import { companySettings } from "@/lib/domain/settings";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const loadCompany = cache(() => companySettings(getDb()));

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await loadCompany();
  return { title: companyName, openGraph: { title: companyName, siteName: companyName } };
}

// Representative movement data — the same shape the real ledger holds
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

const EXPLORE = [
  {
    title: "Raise a purchase order, then receive it",
    detail: "New purchase order → save → Receive tab. The stock level and the movement ledger both update in the same transaction. This is the real write path, not a stub.",
    href: "/purchasing/purchase-orders/new",
  },
  {
    title: "Watch the ledger reconcile",
    detail: "Every stock change is an append-only movement. The on-hand total is rebuilt from that stream, so it cannot disagree with the history.",
    href: "/inventory/movements",
  },
  {
    title: "Switch role to Auditor",
    detail: "The role switcher lives in the top bar. As Auditor, every write route disappears — enforced below the UI, not toggled with CSS.",
    href: "/dashboard",
  },
  {
    title: "Open the handheld surface",
    detail: "A purpose-built operator shell for lookup, scanning and receiving. Same permission engine, designed for one-handed use in a warehouse.",
    href: "/operator",
  },
];

const NOTES = [
  {
    label: "Roles are real",
    detail: "Seven roles drive a can(role, module, action) check that every write route runs server-side. Switching roles in the UI shows exactly what that person can see and do — no extra config.",
  },
  {
    label: "One choke point",
    detail: "Every stock change — receipt, shipment, transfer, adjustment, count, return — commits through one function that locks the row, appends the event, and updates the projection atomically.",
  },
  {
    label: "Automation after commit",
    detail: "Rules evaluate in-process when an event lands. No scheduler. Every run is attributable and can fail without rolling back the write that triggered it.",
  },
  {
    label: "Zero recurring cost",
    detail: "Neon Postgres and Vercel's free tiers, no paid scheduler or queue — the constraint that shaped most of the architecture.",
  },
];

export default async function LandingPage() {
  const { companyName } = await loadCompany();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-20 border-b bg-surface/95 backdrop-blur-sm">
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

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-14 pt-16 sm:pb-20 sm:pt-24">
          <div className="grid items-start gap-12 lg:grid-cols-[1fr_460px] lg:gap-14">
            {/* Copy */}
            <div className="max-w-xl">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-[12px] font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-status-info" aria-hidden />
                Public demo · resets daily
              </p>
              <h1 className="font-heading text-[44px] font-extrabold leading-[1.03] tracking-[-0.03em] sm:text-[62px]">
                Stock numbers<br />you can defend.
              </h1>
              <p className="mt-5 text-[16px] leading-relaxed text-muted-foreground sm:text-[18px]">
                Purchase order to shelf to shipment — one movement ledger,
                role-based permissions, and a full audit trail across every site.
              </p>
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
            </div>

            {/* Movement ledger — the core artifact of the system, shown on arrival */}
            <div className="hidden lg:block">
              <div className="overflow-hidden rounded-lg border bg-surface shadow-md">
                <div className="flex items-center justify-between border-b bg-surface-sunken px-3 py-2.5">
                  <span className="text-[12px] font-semibold text-muted-foreground">
                    Movement ledger
                  </span>
                  <span className="text-[11px] text-muted-foreground">6 sites · live</span>
                </div>
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
                          className="px-3 py-1.5 text-left text-[10px] font-semibold text-muted-foreground"
                          style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {LEDGER.map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{row.ts}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-foreground">{row.sku}</td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground">{row.type}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{row.site}</td>
                        <td
                          className={cn(
                            "px-3 py-2 font-mono text-[11px] font-semibold",
                            row.pos ? "text-status-success" : "text-status-danger",
                          )}
                        >
                          {row.qty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t bg-surface-sunken px-3 py-2">
                  <Link
                    href="/inventory/movements"
                    className="text-[11px] font-medium text-brand transition-colors hover:text-brand/80"
                  >
                    Open the full ledger
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Explore */}
        <section className="border-t">
          <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
            <div className="max-w-xl">
              <h2 className="font-heading text-[24px] font-bold tracking-tight">
                What to explore
              </h2>
              <p className="mt-2 text-[14px] text-muted-foreground">
                Four paths into the system, each exercising a different design principle.
              </p>
            </div>
            <div className="mt-10 grid sm:grid-cols-2">
              {EXPLORE.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group grid content-start gap-2.5 border-t py-7 pr-8 transition-colors sm:even:border-l sm:even:pl-8 sm:even:pr-0"
                >
                  <p className="text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-brand">
                    {item.title}
                  </p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{item.detail}</p>
                  <span className="mt-0.5 flex items-center gap-1 text-[13px] font-medium text-brand">
                    Go
                    <ArrowRight
                      className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden
                    />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Architecture notes */}
        <section className="border-t bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
            <div className="max-w-xl">
              <h2 className="font-heading text-[24px] font-bold tracking-tight">
                Under the hood
              </h2>
              <p className="mt-2 text-[14px] text-muted-foreground">
                The decisions worth reading if you're in the source.
              </p>
            </div>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {NOTES.map((note) => (
                <div key={note.label} className="border-l-2 border-brand pl-4">
                  <p className="text-[14px] font-semibold text-foreground">{note.label}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{note.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
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
