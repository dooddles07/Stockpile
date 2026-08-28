import Link from "next/link";
import type { Metadata } from "next";

import { Section } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { SettingRow, SettingSelect, SettingToggle } from "@/components/settings/setting-row";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { warehouseRollupsSync } from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can, isReadOnly } from "@/lib/auth/permissions";
import { percent, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Warehouse settings",
  description: "Site configuration and defaults.",
};

export default async function WarehouseSettingsPage() {
  const role = await getRole();
  const readOnly = isReadOnly(role, "settings");
  const sites = warehouseRollupsSync();

  const defaultSites = Object.fromEntries(sites.map((w) => [w.id, `${w.code} · ${w.name}`]));

  return (
    <div className="grid gap-4">
      <Section
        title="Site defaults"
        description="Applied to new documents unless the person raising them picks otherwise."
        contentClassName="p-0"
      >
        <SettingRow
          label="Default receiving site"
          description="Pre-selected when raising a purchase order."
          readOnly={readOnly}
        >
          <SettingSelect
            id="default-receiving"
            options={defaultSites}
            defaultValue={sites[0]?.id ?? ""}
            label="Default receiving site"
            width="20rem"
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Default despatch site"
          description="Pre-selected when taking a sales order."
          impact="Availability on the order form is checked against this site, so the default decides which stock a salesperson sees first."
          readOnly={readOnly}
        >
          <SettingSelect
            id="default-despatch"
            options={defaultSites}
            defaultValue={sites[0]?.id ?? ""}
            label="Default despatch site"
            width="20rem"
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Require put-away location on receipt"
          description="Goods cannot be booked in without naming the bin they went to."
          impact="Without this, stock is at the site but nobody knows where — which turns every pick into a search."
          readOnly={readOnly}
        >
          <SettingToggle
            id="require-putaway"
            defaultChecked
            label="Require put-away location"
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Auto-quarantine rejected goods"
          description="Units failing inspection move to a quarantine bin rather than sellable stock."
          readOnly={readOnly}
        >
          <SettingToggle
            id="auto-quarantine"
            defaultChecked
            label="Auto-quarantine rejected goods"
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Block receiving at sites under maintenance"
          description="Inbound deliveries are refused while a site is flagged for maintenance."
          readOnly={readOnly}
        >
          <SettingToggle
            id="block-maintenance"
            defaultChecked
            label="Block receiving during maintenance"
            readOnly={readOnly}
          />
        </SettingRow>
      </Section>

      <Section
        title="Sites"
        description="Capacity and status per warehouse. Editing a site opens its own page."
        actions={
          can(role, "warehouses") && (
            <Button variant="outline" size="sm" className="h-7" render={<Link href="/warehousing/warehouses" />}>
              Manage warehouses
            </Button>
          )
        }
        contentClassName="p-0"
      >
        <SimpleTable
          rows={sites}
          getRowId={(w) => w.id}
          columns={[
            {
              key: "code",
              header: "Site",
              cell: (w) => (
                <Link href={`/warehousing/warehouses/${w.id}`} className="grid gap-0.5 hover:underline">
                  <span className="text-code font-medium">{w.code}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{w.name}</span>
                </Link>
              ),
            },
            { key: "city", header: "Location", hideOnMobile: true, cell: (w) => `${w.city}, ${w.region}` },
            { key: "status", header: "Status", cell: (w) => <StatusBadge status={w.status} /> },
            {
              key: "capacity",
              header: "Capacity",
              align: "right",
              cell: (w) => `${qty(w.usedPallets)} / ${qty(w.capacityPallets)}`,
            },
            {
              key: "utilisation",
              header: "Used",
              align: "right",
              cell: (w) => (
                <span
                  className={
                    w.utilization > 0.9
                      ? "font-semibold text-status-danger"
                      : w.utilization > 0.8
                        ? "text-status-warning"
                        : ""
                  }
                >
                  {percent(w.utilization, 0)}
                </span>
              ),
            },
            { key: "locations", header: "Locations", align: "right", cell: (w) => qty(w.locationCount) },
            { key: "manager", header: "Manager", hideOnMobile: true, cell: (w) => w.managerName },
          ]}
        />
      </Section>
    </div>
  );
}
