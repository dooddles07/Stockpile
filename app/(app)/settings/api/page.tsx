import type { Metadata } from "next";
import { KeyRound, Webhook } from "lucide-react";

import { Section } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { SettingNumber, SettingRow, SettingToggle } from "@/components/settings/setting-row";
import { StatusBadge } from "@/components/status/status-badge";
import { getRole } from "@/lib/auth/session";
import { isReadOnly } from "@/lib/auth/permissions";
import { NOW, daysFromNow } from "@/lib/data/rng";
import { date, qty, relative } from "@/lib/format";
import { ActionButton } from "@/components/actions/action-button";
import { AddEndpointDialog, CreateKeyDialog } from "./api-dialogs";

export const metadata: Metadata = {
  title: "API & webhooks",
  description: "Programmatic access and outbound event delivery.",
};

/**
 * Keys are shown with only their prefix.
 *
 * A full key is displayed exactly once, at creation. Rendering it again here
 * would turn every screenshot and screen-share into a credential leak.
 */
const API_KEYS = [
  {
    id: "key-1",
    name: "Storefront sync",
    prefix: "sk_live_7f2a",
    scopes: ["products:read", "stock:read", "orders:write"],
    createdAt: daysFromNow(-412),
    lastUsedAt: daysFromNow(-0.2),
    status: "active",
  },
  {
    id: "key-2",
    name: "Accounting export",
    prefix: "sk_live_c41d",
    scopes: ["movements:read", "valuation:read"],
    createdAt: daysFromNow(-286),
    lastUsedAt: daysFromNow(-1.1),
    status: "active",
  },
  {
    id: "key-3",
    name: "Warehouse scanners",
    prefix: "sk_live_9e08",
    scopes: ["stock:read", "stock:write", "receiving:write"],
    createdAt: daysFromNow(-155),
    lastUsedAt: daysFromNow(-0.05),
    status: "active",
  },
  {
    id: "key-4",
    name: "Legacy reporting job",
    prefix: "sk_live_2b77",
    scopes: ["reports:read"],
    createdAt: daysFromNow(-940),
    lastUsedAt: daysFromNow(-247),
    status: "inactive",
  },
];

const WEBHOOKS = [
  {
    id: "wh-1",
    event: "stock.low",
    url: "https://ops.stockpile.co/hooks/low-stock",
    deliveries: 4_218,
    failures: 0,
    lastDeliveryAt: daysFromNow(-0.3),
    status: "connected",
  },
  {
    id: "wh-2",
    event: "purchase_order.approved",
    url: "https://edi.tradelink.example/inbound/po",
    deliveries: 1_842,
    failures: 3,
    lastDeliveryAt: daysFromNow(-0.9),
    status: "connected",
  },
  {
    id: "wh-3",
    event: "sales_order.shipped",
    url: "https://storefront.example/hooks/shipped",
    deliveries: 9_104,
    failures: 0,
    lastDeliveryAt: daysFromNow(-0.1),
    status: "connected",
  },
  {
    id: "wh-4",
    event: "adjustment.applied",
    url: "https://ledgerly.example/hooks/journal",
    deliveries: 612,
    failures: 41,
    lastDeliveryAt: daysFromNow(-2.4),
    status: "error",
  },
];

export default async function ApiSettingsPage() {
  const role = await getRole();
  const readOnly = isReadOnly(role, "settings");

  const stale = API_KEYS.filter(
    (k) => NOW.getTime() - new Date(k.lastUsedAt).getTime() > 90 * 86_400_000,
  );
  const failing = WEBHOOKS.filter((w) => w.status === "error");

  return (
    <div className="grid gap-4">
      <Section
        title="API keys"
        description="A key is shown in full once, when it is created. After that only its prefix is ever displayed."
        actions={
          !readOnly && <CreateKeyDialog />
        }
        contentClassName="p-0"
      >
        <SimpleTable
          rows={API_KEYS}
          getRowId={(k) => k.id}
          columns={[
            {
              key: "name",
              header: "Key",
              cell: (k) => (
                <span className="grid gap-0.5">
                  <span className="font-medium">{k.name}</span>
                  <span className="text-code text-[11px] text-muted-foreground">
                    {k.prefix}••••••••••••
                  </span>
                </span>
              ),
            },
            {
              key: "scopes",
              header: "Scopes",
              cell: (k) => (
                <span className="flex flex-wrap gap-1">
                  {k.scopes.map((scope) => (
                    <StatusBadge
                      key={scope}
                      label={scope}
                      tone={scope.endsWith(":write") ? "warning" : "neutral"}
                      showDot={false}
                    />
                  ))}
                </span>
              ),
            },
            {
              key: "created",
              header: "Created",
              align: "right",
              hideOnMobile: true,
              cell: (k) => <span className="text-muted-foreground">{date(k.createdAt)}</span>,
            },
            {
              key: "lastUsed",
              header: "Last used",
              align: "right",
              cell: (k) => {
                const isStale = stale.some((s) => s.id === k.id);
                return (
                  <span className={isStale ? "font-medium text-status-warning" : "text-muted-foreground"}>
                    {relative(k.lastUsedAt)}
                  </span>
                );
              },
            },
            { key: "status", header: "Status", cell: (k) => <StatusBadge status={k.status} /> },
            {
              key: "action",
              header: "",
              align: "right",
              cell: (k) =>
                readOnly ? null : (
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    className="h-7 text-destructive hover:text-destructive"
                    tone="warning"
                    feedback={`${k.name} revoked`}
                    detail="Anything still calling with this key starts getting 401s immediately."
                    confirm={{
                      title: `Revoke ${k.name}?`,
                      body: `Every integration using this key stops working the moment it is revoked, and the key cannot be restored. Last used ${relative(k.lastUsedAt)}.`,
                      action: "Revoke key",
                    }}
                  >
                    Revoke
                  </ActionButton>
                ),
            },
          ]}
        />
      </Section>

      {stale.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-status-warning-border bg-status-warning-bg px-4 py-3">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
          <p className="text-caption leading-relaxed text-status-warning/90">
            {stale.length === 1 ? "One key has" : `${stale.length} keys have`} not been used in over
            90 days. An unused key is all downside — it can still authenticate, and nobody would
            notice if it were stolen.
          </p>
        </div>
      )}

      <Section
        title="Webhooks"
        description="Outbound events. Failed deliveries retry with backoff for 24 hours, then stop."
        actions={
          !readOnly && <AddEndpointDialog />
        }
        contentClassName="p-0"
      >
        <SimpleTable
          rows={WEBHOOKS}
          getRowId={(w) => w.id}
          columns={[
            {
              key: "event",
              header: "Event",
              cell: (w) => <span className="text-code font-medium">{w.event}</span>,
            },
            {
              key: "url",
              header: "Endpoint",
              cell: (w) => <span className="text-code truncate text-muted-foreground">{w.url}</span>,
            },
            {
              key: "deliveries",
              header: "Delivered",
              align: "right",
              cell: (w) => qty(w.deliveries),
            },
            {
              key: "failures",
              header: "Failed",
              align: "right",
              cell: (w) =>
                w.failures > 0 ? (
                  <span className="font-semibold text-status-danger">{qty(w.failures)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            },
            {
              key: "last",
              header: "Last delivery",
              align: "right",
              hideOnMobile: true,
              cell: (w) => <span className="text-muted-foreground">{relative(w.lastDeliveryAt)}</span>,
            },
            { key: "status", header: "Status", cell: (w) => <StatusBadge status={w.status} /> },
          ]}
        />
      </Section>

      {failing.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-status-danger-border bg-status-danger-bg px-4 py-3">
          <Webhook className="mt-0.5 size-4 shrink-0 text-status-danger" aria-hidden />
          <p className="text-caption leading-relaxed text-status-danger/90">
            <span className="font-medium">{failing[0].event}</span> is failing to deliver to{" "}
            {failing[0].url}. Events that exhaust their retries are dropped, so the receiving system
            is now missing data with no gap visible on its side.
          </p>
        </div>
      )}

      <Section title="Access rules" description="Limits applied to every API caller." contentClassName="p-0">
        <SettingRow
          label="Rate limit"
          description="Requests per minute per key."
          readOnly={readOnly}
        >
          <SettingNumber
            id="rate-limit"
            defaultValue={600}
            label="Rate limit"
            suffix="req/min"
            min={60}
            step={60}
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Require HTTPS for webhooks"
          description="Reject endpoints that are not TLS-protected."
          impact="Webhook payloads carry stock levels and order values. Over plain HTTP, so does anyone on the path."
          readOnly={readOnly}
        >
          <SettingToggle id="webhook-https" defaultChecked label="Require HTTPS" readOnly={readOnly} />
        </SettingRow>

        <SettingRow
          label="Sign webhook payloads"
          description="Each delivery carries an HMAC signature the receiver can verify."
          readOnly={readOnly}
        >
          <SettingToggle id="webhook-signing" defaultChecked label="Sign webhook payloads" readOnly={readOnly} />
        </SettingRow>

        <SettingRow
          label="Log every API call"
          description="Write each request to the audit log."
          impact="Useful for investigating an integration, expensive at volume — this is the noisiest thing you can turn on."
          readOnly={readOnly}
        >
          <SettingToggle id="log-api" defaultChecked={false} label="Log every API call" readOnly={readOnly} />
        </SettingRow>
      </Section>
    </div>
  );
}
