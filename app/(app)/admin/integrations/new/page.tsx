import Link from "next/link";
import type { Metadata } from "next";
import { Plug } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { Section } from "@/components/record/field-grid";
import { Button } from "@/components/ui/button";
import { ConnectionDialog } from "../connection-dialog";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Connect a system",
  description: "Add an integration so Stockpile exchanges data with it.",
};

interface Candidate {
  name: string;
  vendor: string;
  group: string;
  blurb: string;
}

/**
 * The catalogue of systems Stockpile speaks to. Grouped by what the connector
 * actually moves rather than by vendor, because that is the question being
 * asked: "how do orders get in", not "who makes it".
 */
const CATALOGUE: Candidate[] = [
  {
    name: "Storefront Sync",
    vendor: "Commerce Cloud",
    group: "Orders in",
    blurb: "Two-way sync of products, prices and stock with an online storefront; orders come back as sales orders.",
  },
  {
    name: "Marketplace Bridge",
    vendor: "Channel Aggregator",
    group: "Orders in",
    blurb: "Listings and inventory pushed to marketplaces, with their orders pulled in on a five-minute cycle.",
  },
  {
    name: "EDI 850/856 Gateway",
    vendor: "TradeLink",
    group: "Orders in",
    blurb: "Structured purchase orders and despatch advices exchanged with contracted trading partners.",
  },
  {
    name: "General Ledger Export",
    vendor: "Ledgerly",
    group: "Money out",
    blurb: "Nightly journal export of inventory movements and valuation, posted against your chart of accounts.",
  },
  {
    name: "Payments Reconciliation",
    vendor: "Pathway Pay",
    group: "Money out",
    blurb: "Captures and refunds matched back to sales orders so paid and shipped never drift apart.",
  },
  {
    name: "Carrier Rates & Labels",
    vendor: "Transit Group",
    group: "Goods out",
    blurb: "Live rates at packing, labels printed at the bench, tracking written back to the order.",
  },
  {
    name: "Warehouse Robotics Feed",
    vendor: "Axis Automation",
    group: "Goods out",
    blurb: "Pick tasks handed to automation and confirmed back as movements when the bin is emptied.",
  },
  {
    name: "Analytics Warehouse",
    vendor: "Northwind BI",
    group: "Reporting",
    blurb: "Movements, valuation and order facts streamed into your own warehouse for reporting.",
  },
];

export default async function ConnectIntegrationPage() {
  const role = await getRole();
  if (!can(role, "integrations", "manage")) {
    return <PermissionDenied module="integrations" role={role} action="connect systems for" />;
  }

  const alreadyConnected = new Set(
    db.integrations.filter((i) => i.status !== "disconnected").map((i) => i.name),
  );
  const groups = [...new Set(CATALOGUE.map((c) => c.group))];

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Administration", href: "/admin/users" },
          { label: "Integrations", href: "/admin/integrations" },
          { label: "Connect" },
        ]}
        title="Connect a system"
        description="Every connector added is a second source of truth to keep honest. Connect what the business genuinely runs on, and leave the rest — a stale feed quietly corrupts stock figures that still look plausible."
        actions={
          <Button variant="outline" size="sm" className="h-8" render={<Link href="/admin/integrations" />}>
            Back to integrations
          </Button>
        }
      />

      <div className="grid gap-4 p-4 sm:p-6">
        {groups.map((group) => (
          <Section key={group} title={group}>
            <ul className="grid gap-2">
              {CATALOGUE.filter((c) => c.group === group).map((candidate) => {
                const connected = alreadyConnected.has(candidate.name);
                return (
                  <li
                    key={candidate.name}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-surface p-3"
                  >
                    <div className="flex min-w-0 gap-3">
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-sunken text-muted-foreground"
                        aria-hidden
                      >
                        <Plug className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-card-title">{candidate.name}</h3>
                        <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
                          {candidate.blurb}
                        </p>
                        <p className="mt-1.5 text-caption text-muted-foreground">
                          {candidate.vendor}
                          {connected && " · already connected"}
                        </p>
                      </div>
                    </div>

                    <ConnectionDialog
                      name={candidate.name}
                      vendor={candidate.vendor}
                      connected={connected}
                    />
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}
      </div>
    </>
  );
}
