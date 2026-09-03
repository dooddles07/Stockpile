import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  ChartNoAxesCombined,
  Code2,
  Handshake,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status/status-badge";
import { getDb } from "@/lib/db/client";
import { companySettings } from "@/lib/domain/settings";

// Reads the stored company name, so it cannot be prerendered — a production
// build carries no connection string, exactly as the (app) segment relies on.
export const dynamic = "force-dynamic";

// One query per request, shared by generateMetadata and the page body.
const loadCompany = cache(() => companySettings(getDb()));

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await loadCompany();
  return { title: companyName, openGraph: { title: companyName, siteName: companyName } };
}

const TRY = [
  {
    icon: Boxes,
    title: "Raise a purchase order, then receive it",
    body: "New purchase order → save → Receive tab. The stock level and the movement ledger both move — this is the real write path, not a mock-up.",
    href: "/purchasing/purchase-orders/new",
  },
  {
    icon: ScrollText,
    title: "Watch the ledger reconcile",
    body: "Every stock change is an append-only Movement. The stock page's on-hand is a projection rebuilt from that stream, and it never disagrees with it.",
    href: "/inventory/movements",
  },
  {
    icon: ShieldCheck,
    title: "Switch role to Auditor",
    body: "The role switcher is in the top bar. As Auditor, every New button, row action and write route disappears — permission is enforced below the UI, not hidden with CSS.",
    href: "/dashboard",
  },
  {
    icon: Smartphone,
    title: "Open the handheld surface",
    body: "A separate operator view for lookup, scanning and receiving on a phone — the same permission engine, a different shell.",
    href: "/operator",
  },
];

export default async function LandingPage() {
  const { companyName } = await loadCompany();

  return (
    <main className="min-h-full bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-16 px-6 py-16 sm:py-24">
        <header className="grid gap-6">
          <div className="flex items-center gap-2">
            <StatusBadge label="Public demo · resets daily" tone="info" />
          </div>
          <h1 className="font-heading text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[56px]">
            {companyName}
          </h1>
          <p className="max-w-2xl text-[17px] leading-relaxed text-muted-foreground sm:text-[19px]">
            An inventory platform for businesses that hold stock across several sites — purchase
            order to shelf to shipment, with the movement ledger, role-based permissions and audit
            trail that make the numbers defensible.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" className="h-11 px-6 text-[15px]" render={<Link href="/dashboard" />}>
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
        </header>

        <section className="rounded-lg border border-status-info-border bg-status-info-bg px-5 py-4">
          <div className="flex items-start gap-3">
            <RotateCcw className="mt-0.5 size-4 shrink-0 text-status-info" aria-hidden />
            <p className="text-[13px] leading-relaxed text-status-info/90">
              <span className="font-medium text-status-info">Writes here are real.</span> Create an
              order, receive stock, run a count — it commits to Postgres, not local state. The
              catch: everyone shares one seeded demo account, and the whole database truncates and
              reloads once a day, so nothing you do here is permanent.
            </p>
          </div>
        </section>

        <section className="grid gap-6">
          <h2 className="font-heading text-[22px] font-semibold tracking-tight">What to try</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {TRY.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="group grid gap-2.5 rounded-lg border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-hover"
              >
                <item.icon className="size-5 text-brand" aria-hidden />
                <p className="text-[15px] font-semibold leading-snug">{item.title}</p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{item.body}</p>
                <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-brand">
                  Try it
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-4 border-t pt-10">
          <h2 className="font-heading text-[22px] font-semibold tracking-tight">
            The parts worth looking at
          </h2>
          <ul className="grid gap-3 text-[14px] leading-relaxed text-muted-foreground sm:grid-cols-2">
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>
                <span className="font-medium text-foreground">Roles are real.</span> Seven roles
                drive a <code className="text-code text-[13px]">can(role, module, action)</code>{" "}
                engine that every write checks server-side.
              </span>
            </li>
            <li className="flex gap-2.5">
              <ScrollText className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>
                <span className="font-medium text-foreground">One choke point.</span> Every stock
                change — receiving, shipping, transfers, adjustments, counts, returns — commits
                through one function that locks the row, appends an event and updates the
                projection in a single transaction.
              </span>
            </li>
            <li className="flex gap-2.5">
              <ChartNoAxesCombined className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>
                <span className="font-medium text-foreground">Automation runs after commit.</span>{" "}
                Rules evaluate in-process when an event lands, no scheduler, and every run is
                attributable and can fail without failing the write that triggered it.
              </span>
            </li>
            <li className="flex gap-2.5">
              <Handshake className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>
                <span className="font-medium text-foreground">Zero recurring cost.</span> Neon
                Postgres and Vercel&apos;s free tiers, no paid scheduler or queue — the constraint that
                shapes most of the rest of the design.
              </span>
            </li>
          </ul>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-8 text-[13px] text-muted-foreground">
          <span>Built with Next.js, React, TypeScript, Drizzle and Neon Postgres.</span>
          <Link
            href="https://github.com/dooddles07/Stockpile"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-brand"
          >
            <Code2 className="size-3.5" aria-hidden />
            github.com/dooddles07/Stockpile
          </Link>
        </footer>
      </div>
    </main>
  );
}
