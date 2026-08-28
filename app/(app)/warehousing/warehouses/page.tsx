import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, MapPin, Plus, UserRound } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { MeterBar, capacityTone } from "@/components/status/meter-bar";
import { warehouseRollupsSync } from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money, percent, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Warehouses",
  description: "Every site, what it holds and how full it is.",
};

const TYPE_LABEL: Record<string, string> = {
  distribution: "Distribution",
  fulfillment: "Fulfillment",
  retail: "Retail depot",
  cold: "Cold storage",
};

export default async function WarehousesPage() {
  const role = await getRole();
  if (!can(role, "warehouses")) return <PermissionDenied module="warehouses" role={role} />;

  const sites = warehouseRollupsSync().sort((a, b) => b.inventoryValue - a.inventoryValue);
  const showValue = can(role, "valuation") || can(role, "warehouses", "export");

  const totalValue = sites.reduce((s, w) => s + w.inventoryValue, 0);
  const totalUnits = sites.reduce((s, w) => s + w.unitCount, 0);
  const capacity = sites.reduce((s, w) => s + w.capacityPallets, 0);
  const used = sites.reduce((s, w) => s + w.usedPallets, 0);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Warehousing", href: "/warehousing/warehouses" }, { label: "Warehouses" }]}
        title="Warehouses"
        description={`${sites.length} sites holding ${qty(totalUnits)} units. Utilisation is measured in pallet positions, not floor area — that is what actually runs out.`}
        actions={
          can(role, "warehouses", "create") && (
            <Button size="sm" className="h-8" render={<Link href="/warehousing/warehouses/new" />}>
              <Plus className="size-3.5" aria-hidden />
              New warehouse
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Sites" value={sites.length} hint={`${sites.filter((s) => s.status === "operational").length} operational`} />
          <StatTile label="Units held" value={qty(totalUnits)} />
          <StatTile
            label="Capacity used"
            value={percent(used / capacity, 0)}
            tone={used / capacity > 0.9 ? "danger" : used / capacity > 0.8 ? "warning" : "success"}
            hint={`${qty(used)} of ${qty(capacity)} pallet positions`}
          />
          <StatTile
            label="Inventory value"
            value={showValue ? money(totalValue) : "—"}
            hint={showValue ? "Across all sites" : "Restricted"}
          />
        </div>
      </PageHeader>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2 xl:grid-cols-3">
        {sites.map((site) => {
          const utilisation = site.utilization;
          const tone = capacityTone(utilisation);

          return (
            <article
              key={site.id}
              className="flex flex-col overflow-hidden rounded-lg border bg-surface shadow-xs"
            >
              <header className="border-b px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-code text-[13px] font-semibold">{site.code}</span>
                      <StatusBadge status={site.status} />
                    </div>
                    <h2 className="text-card-title mt-1 truncate">
                      <Link href={`/warehousing/warehouses/${site.id}`} className="hover:underline">
                        {site.name}
                      </Link>
                    </h2>
                    <p className="mt-1 flex items-center gap-1.5 text-caption text-muted-foreground">
                      <MapPin className="size-3" aria-hidden />
                      {site.city}, {site.region} · {TYPE_LABEL[site.type]}
                    </p>
                  </div>
                </div>
              </header>

              <div className="grid gap-3 border-b px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-caption text-muted-foreground">Pallet positions</span>
                  <span
                    className={cn(
                      "tabular text-[13px] font-semibold",
                      tone === "danger" && "text-status-danger",
                      tone === "warning" && "text-status-warning",
                      tone === "success" && "text-status-success",
                    )}
                    data-numeric
                  >
                    {percent(utilisation, 0)}
                  </span>
                </div>
                <MeterBar
                  value={utilisation}
                  tone={tone}
                  size="sm"
                  label={`${site.code} is at ${percent(utilisation, 0)} of its pallet capacity`}
                />
                <p className="text-caption text-muted-foreground">
                  {qty(site.usedPallets)} of {qty(site.capacityPallets)} used ·{" "}
                  {qty(site.capacityPallets - site.usedPallets)} free
                </p>
              </div>

              <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">
                <div>
                  <dt className="text-caption text-muted-foreground">SKUs held</dt>
                  <dd className="tabular text-[15px] font-semibold" data-numeric>
                    {qty(site.skuCount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Units</dt>
                  <dd className="tabular text-[15px] font-semibold" data-numeric>
                    {qty(site.unitCount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Locations</dt>
                  <dd className="tabular text-[15px] font-semibold" data-numeric>
                    {qty(site.locationCount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Open transfers</dt>
                  <dd className="tabular text-[15px] font-semibold" data-numeric>
                    {qty(site.openTransfers)}
                  </dd>
                </div>
                {showValue && (
                  <div className="col-span-2">
                    <dt className="text-caption text-muted-foreground">Inventory value</dt>
                    <dd className="tabular text-[15px] font-semibold" data-numeric>
                      {money(site.inventoryValue)}
                    </dd>
                  </div>
                )}
              </dl>

              <footer className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
                <span className="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
                  <UserRound className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{site.managerName}</span>
                </span>
                <Link
                  href={`/warehousing/warehouses/${site.id}`}
                  className="group/link flex shrink-0 items-center gap-1 text-caption font-medium transition-colors hover:text-foreground"
                >
                  Open
                  <ArrowRight
                    className="size-3 transition-transform group-hover/link:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </footer>
            </article>
          );
        })}
      </div>
    </>
  );
}
