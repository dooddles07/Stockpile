import Link from "next/link";
import type { Metadata } from "next";
import { Blocks, Plug, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, PermissionDenied } from "@/components/states";
import { Section, StatTile } from "@/components/record/field-grid";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { plural, qty, relative } from "@/lib/format";
import { humanize } from "@/lib/status";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/actions/action-button";
import { ConnectionDialog } from "./connection-dialog";

export const metadata: Metadata = {
  title: "Integrations",
  description: "Systems Stockpile exchanges data with.",
};

const CATEGORY_LABEL: Record<string, string> = {
  ecommerce: "E-commerce",
  accounting: "Accounting",
  shipping: "Shipping",
  payments: "Payments",
  edi: "EDI",
  bi: "Analytics",
};

const CATEGORY_NOTE: Record<string, string> = {
  ecommerce: "Product, price and stock feeds out; orders in.",
  accounting: "Inventory movements and valuation posted as journals.",
  shipping: "Rates, labels and tracking for outbound despatch.",
  payments: "Capture and refund reconciliation against sales orders.",
  edi: "Structured order documents exchanged with contracted partners.",
  bi: "Facts streamed into the analytics warehouse for reporting.",
};

export default async function IntegrationsPage() {
  const role = await getRole();
  if (!can(role, "integrations")) return <PermissionDenied module="integrations" role={role} />;

  const integrations = db.integrations;
  const connected = integrations.filter((i) => i.status === "connected");
  const errored = integrations.filter((i) => i.status === "error");
  const disconnected = integrations.filter((i) => i.status === "disconnected");
  const records = integrations.reduce((s, i) => s + i.recordsSynced, 0);

  const categories = [...new Set(integrations.map((i) => i.category))];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Administration", href: "/admin/users" }, { label: "Integrations" }]}
        title="Integrations"
        description="An integration that silently stops syncing is worse than one that was never connected — the numbers keep looking plausible while drifting further from reality. Failures are surfaced here first."
        actions={
          can(role, "integrations", "manage") && (
            <Button size="sm" className="h-8" render={<Link href="/admin/integrations/new" />}>
              <Plug className="size-3.5" aria-hidden />
              Connect a system
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Integrations" value={qty(integrations.length)} />
          <StatTile
            label="Connected"
            value={qty(connected.length)}
            tone="success"
            hint={`${qty(records)} records synced`}
          />
          <StatTile
            label="Failing"
            value={qty(errored.length)}
            tone={errored.length > 0 ? "danger" : "success"}
            hint={errored.length > 0 ? "Data is going stale" : "Everything healthy"}
          />
          <StatTile
            label="Not connected"
            value={qty(disconnected.length)}
            tone={disconnected.length > 0 ? "neutral" : "success"}
          />
        </div>
      </PageHeader>

      <div className="grid gap-6 p-4 sm:p-6">
        {errored.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-status-danger-border bg-status-danger-bg p-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-danger" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-status-danger">
                {plural(errored.length, "integration")} failing
              </p>
              <p className="mt-1 text-caption leading-relaxed text-status-danger/90">
                {errored.map((i) => i.name).join(", ")} stopped syncing. Anything downstream of them
                is now working from stale data, and will keep looking correct while drifting.
              </p>
            </div>
          </div>
        )}

        {integrations.length === 0 ? (
          <div className="rounded-lg border bg-surface">
            <EmptyState
              icon={Blocks}
              title="Nothing connected"
              description="Integrations bring in orders and push out stock levels, journals and labels."
            />
          </div>
        ) : (
          categories.map((category) => {
            const inCategory = integrations.filter((i) => i.category === category);
            return (
              <Section
                key={category}
                title={CATEGORY_LABEL[category] ?? humanize(category)}
                description={CATEGORY_NOTE[category]}
                contentClassName="p-0"
              >
                <ul className="divide-y">
                  {inCategory.map((integration) => (
                    <li
                      key={integration.id}
                      className="flex flex-wrap items-start justify-between gap-4 px-4 py-3.5"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span
                          className={cn(
                            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border",
                            integration.status === "connected" &&
                              "border-status-success-border bg-status-success-bg text-status-success",
                            integration.status === "syncing" &&
                              "border-status-info-border bg-status-info-bg text-status-info",
                            integration.status === "error" &&
                              "border-status-danger-border bg-status-danger-bg text-status-danger",
                            integration.status === "disconnected" &&
                              "bg-surface-sunken text-muted-foreground",
                          )}
                          aria-hidden
                        >
                          <Plug className="size-4" />
                        </span>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-card-title">{integration.name}</h3>
                            <StatusBadge status={integration.status} />
                          </div>
                          <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
                            {integration.description}
                          </p>
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
                            <span>{integration.vendor}</span>
                            <span aria-hidden>·</span>
                            <span className="tabular" data-numeric>
                              {qty(integration.recordsSynced)} records
                            </span>
                            <span aria-hidden>·</span>
                            <span>
                              {integration.lastSyncAt
                                ? `synced ${relative(integration.lastSyncAt)}`
                                : "never synced"}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {can(role, "integrations", "manage") ? (
                          <>
                            {integration.status === "error" && (
                              <ActionButton
                                variant="outline" size="sm" className="h-7"
                                feedback="Sync queued"
                                detail={`${integration.name} runs again on the next connector cycle.`}
                              >
                                Retry sync
                              </ActionButton>
                            )}
                            <ConnectionDialog
                              name={integration.name}
                              vendor={integration.vendor}
                              connected={integration.status !== "disconnected"}
                            />
                          </>
                        ) : (
                          <span className="text-caption text-muted-foreground">View only</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            );
          })
        )}
      </div>
    </>
  );
}
