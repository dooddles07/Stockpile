import type { Metadata } from "next";
import { Bell } from "lucide-react";

import { Section } from "@/components/record/field-grid";
import { SettingNumber, SettingRow, SettingToggle } from "@/components/settings/setting-row";
import { StatusBadge } from "@/components/status/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { getRole } from "@/lib/auth/session";
import { isReadOnly } from "@/lib/auth/permissions";
import { priorityMeta } from "@/lib/status";

export const metadata: Metadata = {
  title: "Notification settings",
  description: "What the system tells you about, and how.",
};

/**
 * Alert routing.
 *
 * Everything critical is on by default and cannot be silenced entirely — an
 * out-of-stock SKU with an open order against it is not a preference.
 */
const ALERTS = [
  {
    id: "stockout",
    label: "Out of stock",
    description: "An active SKU has nothing available to allocate.",
    priority: "critical" as const,
    inApp: true,
    email: true,
    digest: false,
    locked: true,
  },
  {
    id: "low-stock",
    label: "Low stock",
    description: "Available quantity has fallen below the reorder point.",
    priority: "high" as const,
    inApp: true,
    email: true,
    digest: true,
    locked: false,
  },
  {
    id: "approval",
    label: "Approval required",
    description: "A purchase order, transfer, adjustment or count needs a decision.",
    priority: "high" as const,
    inApp: true,
    email: true,
    digest: false,
    locked: false,
  },
  {
    id: "expiry",
    label: "Expiring stock",
    description: "A tracked lot is inside the expiry warning window.",
    priority: "high" as const,
    inApp: true,
    email: false,
    digest: true,
    locked: false,
  },
  {
    id: "receiving",
    label: "Delivery arrived",
    description: "A shipment is at a goods-in dock and ready to be checked in.",
    priority: "normal" as const,
    inApp: true,
    email: false,
    digest: false,
    locked: false,
  },
  {
    id: "overdue",
    label: "Overdue delivery",
    description: "A purchase order has passed its expected date without arriving.",
    priority: "high" as const,
    inApp: true,
    email: true,
    digest: true,
    locked: false,
  },
  {
    id: "integration",
    label: "Integration failure",
    description: "A connected system stopped syncing.",
    priority: "critical" as const,
    inApp: true,
    email: true,
    digest: false,
    locked: true,
  },
  {
    id: "import",
    label: "Import finished",
    description: "A data import completed, with or without warnings.",
    priority: "normal" as const,
    inApp: true,
    email: false,
    digest: false,
    locked: false,
  },
  {
    id: "count",
    label: "Count due",
    description: "A scheduled stock count is due to start.",
    priority: "normal" as const,
    inApp: true,
    email: false,
    digest: true,
    locked: false,
  },
  {
    id: "variance",
    label: "Count variance breach",
    description: "A count came in below the accuracy threshold.",
    priority: "high" as const,
    inApp: true,
    email: true,
    digest: false,
    locked: false,
  },
];

export default async function NotificationSettingsPage() {
  const role = await getRole();
  const readOnly = isReadOnly(role, "settings");

  return (
    <div className="grid gap-4">
      <Section
        title="Alert routing"
        description="Which alerts reach you, and through which channel. Critical alerts cannot be turned off entirely."
        contentClassName="p-0"
      >
        <div className="overflow-x-auto">
          <Table className="text-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[16rem] bg-surface-sunken px-4 text-[11px] font-semibold uppercase text-muted-foreground">
                  Alert
                </TableHead>
                <TableHead className="bg-surface-sunken px-3 text-[11px] font-semibold uppercase text-muted-foreground">
                  Priority
                </TableHead>
                <TableHead className="bg-surface-sunken px-3 text-center text-[11px] font-semibold uppercase text-muted-foreground">
                  In app
                </TableHead>
                <TableHead className="bg-surface-sunken px-3 text-center text-[11px] font-semibold uppercase text-muted-foreground">
                  Email
                </TableHead>
                <TableHead className="bg-surface-sunken px-3 text-center text-[11px] font-semibold uppercase text-muted-foreground">
                  Daily digest
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {ALERTS.map((alert) => {
                const tone = priorityMeta(alert.priority);
                return (
                  <TableRow key={alert.id} className="border-b">
                    <TableCell className="px-4 py-2.5">
                      <span className="grid gap-0.5">
                        <span className="flex items-center gap-2 font-medium">
                          {alert.label}
                          {alert.locked && (
                            <StatusBadge label="Always on" tone="neutral" showDot={false} />
                          )}
                        </span>
                        <span className="text-[11px] leading-relaxed text-muted-foreground">
                          {alert.description}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <StatusBadge label={tone.label} tone={tone.tone} />
                    </TableCell>
                    {(["inApp", "email", "digest"] as const).map((channel) => (
                      <TableCell key={channel} className="px-3 py-2.5 text-center">
                        <Checkbox
                          defaultChecked={alert[channel]}
                          disabled={readOnly || (alert.locked && channel !== "digest")}
                          aria-label={`${alert.label} via ${channel}`}
                          className="mx-auto"
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Delivery" description="How and when notifications leave the system." contentClassName="p-0">
        <SettingRow
          label="Daily digest time"
          description="When the digest of non-urgent alerts is sent."
          readOnly={readOnly}
        >
          <SettingNumber
            id="digest-hour"
            defaultValue={7}
            label="Daily digest hour"
            suffix=":00 local"
            min={0}
            max={23}
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Group repeated alerts"
          description="Roll multiple alerts of the same kind into one notification."
          impact="Without this, a bad receipt across forty lines produces forty notifications and everybody stops reading them."
          readOnly={readOnly}
        >
          <SettingToggle id="group-alerts" defaultChecked label="Group repeated alerts" readOnly={readOnly} />
        </SettingRow>

        <SettingRow
          label="Escalate unactioned approvals"
          description="Re-notify when an approval has been waiting this long."
          readOnly={readOnly}
        >
          <SettingNumber
            id="escalate-hours"
            defaultValue={24}
            label="Escalate after"
            suffix="hours"
            min={1}
            max={168}
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Quiet hours"
          description="Suppress non-critical email outside working hours."
          impact="Critical alerts still go out — an integration failure at 02:00 is exactly when it needs to be seen."
          readOnly={readOnly}
        >
          <SettingToggle id="quiet-hours" defaultChecked label="Quiet hours" readOnly={readOnly} />
        </SettingRow>
      </Section>

      <div className="flex items-start gap-2.5 rounded-lg border bg-surface px-4 py-3">
        <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-caption leading-relaxed text-muted-foreground">
          These settings are per user, not per company. Someone else in the same role can be routed
          differently — a warehouse manager on nights will want receiving alerts that a buyer does
          not.
        </p>
      </div>
    </div>
  );
}
