"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section, StatTile } from "@/components/record/field-grid";
import { LineItemEditor, lineTotals, type EditorLine } from "@/components/record/line-item-editor";
import { WorkflowStepper } from "@/components/status/workflow-stepper";
import { StatusBadge } from "@/components/status/status-badge";
import { MeterBar } from "@/components/status/meter-bar";
import { money, percent, plural, qty } from "@/lib/format";
import { humanize } from "@/lib/status";
import { cn } from "@/lib/utils";

export interface OrderCustomer {
  id: string;
  code: string;
  name: string;
  type: string;
  city: string;
  status: string;
  creditLimit: number;
  outstanding: number;
}

export interface OrderStockRow {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  unitCost: number;
  sellPrice: number;
  warehouseId: string;
  available: number;
}

const CHANNELS = ["web", "edi", "phone", "pos", "marketplace"];

export function OrderForm({
  customers,
  warehouses,
  stock,
}: {
  customers: OrderCustomer[];
  warehouses: { id: string; code: string; name: string }[];
  stock: OrderStockRow[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = React.useState(customers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = React.useState(warehouses[0]?.id ?? "");
  const [channel, setChannel] = React.useState("phone");
  const [promisedDays, setPromisedDays] = React.useState(5);
  const [shipping, setShipping] = React.useState(0);
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<EditorLine[]>([]);

  const customerLabels = React.useMemo(
    () => Object.fromEntries(customers.map((c) => [c.id, `${c.name} · ${c.code}`])),
    [customers],
  );
  const warehouseLabels = React.useMemo(
    () => Object.fromEntries(warehouses.map((w) => [w.id, `${w.code} · ${w.name}`])),
    [warehouses],
  );
  const channelLabels = React.useMemo(
    () => Object.fromEntries(CHANNELS.map((c) => [c, humanize(c)])),
    [],
  );

  const customer = customers.find((c) => c.id === customerId);

  // Availability is per site: the global figure would happily accept an order
  // the chosen warehouse cannot fill.
  const siteStock = React.useMemo(
    () =>
      stock
        .filter((s) => s.warehouseId === warehouseId)
        .map((s) => ({
          id: s.productId,
          sku: s.sku,
          name: s.name,
          unit: s.unit,
          unitCost: s.unitCost,
          sellPrice: s.sellPrice,
          available: s.available,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [stock, warehouseId],
  );

  const availabilityById = React.useMemo(
    () => new Map(siteStock.map((s) => [s.id, s.available])),
    [siteStock],
  );

  const changeWarehouse = (next: string) => {
    if (next === warehouseId) return;
    setWarehouseId(next);
    if (lines.length > 0) {
      toast.info("Availability recalculated", {
        description: "Lines are kept, but each is now checked against the new site's stock.",
      });
    }
  };

  const totals = lineTotals(lines, shipping);

  const shortLines = lines.filter(
    (l) => l.quantity > (availabilityById.get(l.product.id) ?? 0),
  );
  const backorderUnits = shortLines.reduce(
    (s, l) => s + (l.quantity - (availabilityById.get(l.product.id) ?? 0)),
    0,
  );

  const creditAvailable = customer ? Math.max(0, customer.creditLimit - customer.outstanding) : 0;
  const creditAfter = customer ? customer.outstanding + totals.total : 0;
  const creditUsedAfter = customer && customer.creditLimit > 0 ? creditAfter / customer.creditLimit : 0;
  const overCredit = customer ? creditAfter > customer.creditLimit : false;
  const customerBlocked = customer?.status !== "active";

  const canSubmit = lines.length > 0 && !customerBlocked && !overCredit;

  const submit = (asDraft: boolean) => {
    if (!asDraft && !canSubmit) return;
    toast.success(
      asDraft
        ? "Order saved as a draft"
        : shortLines.length > 0
          ? "Order confirmed with a backorder"
          : "Order confirmed and stock reserved",
      {
        description: asDraft
          ? "Nothing is reserved yet. Finish it later from the sales orders list."
          : shortLines.length > 0
            ? `${qty(totals.units - backorderUnits)} units reserved at ${warehouses.find((w) => w.id === warehouseId)?.code}; ${qty(backorderUnits)} on backorder until stock arrives.`
            : `${qty(totals.units)} units reserved at ${warehouses.find((w) => w.id === warehouseId)?.code} and released for picking.`,
      },
    );
    router.push("/sales/orders");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section title="Customer and fulfillment" description="Who is buying, and which site ships it.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="customer">Customer</Label>
              <Select items={customerLabels} value={customerId} onValueChange={(v) => setCustomerId(v ?? "")}>
                <SelectTrigger id="customer" className={cn(customerBlocked && "border-status-warning")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customer && (
                <p className="text-caption text-muted-foreground">
                  {humanize(customer.type)} · {customer.city} · {money(creditAvailable)} credit
                  available
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="warehouse">Ship from</Label>
              <Select items={warehouseLabels} value={warehouseId} onValueChange={(v) => changeWarehouse(v ?? "")}>
                <SelectTrigger id="warehouse">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.code} · {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="channel">Channel</Label>
              <Select items={channelLabels} value={channel} onValueChange={(v) => setChannel(v ?? "phone")}>
                <SelectTrigger id="channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {humanize(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="promised">Promise in (days)</Label>
              <Input
                id="promised"
                type="number"
                min={0}
                max={90}
                inputMode="numeric"
                value={promisedDays}
                onChange={(e) => setPromisedDays(Math.max(0, Number(e.target.value) || 0))}
                className="text-right tabular"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="shipping">Shipping</Label>
              <Input
                id="shipping"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={shipping}
                onChange={(e) => setShipping(Math.max(0, Number(e.target.value) || 0))}
                className="text-right tabular"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Order notes</Label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Delivery access, signature requirements, do-not-split instructions."
              />
            </div>
          </div>

          {customerBlocked && customer && (
            <div className="mt-4 flex items-start gap-3 rounded-md border border-status-warning-border bg-status-warning-bg p-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-status-warning">
                  {customer.name} is {customer.status === "on-hold" ? "on hold" : "inactive"}
                </p>
                <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
                  Stock cannot be reserved for this account until the hold is lifted. You can still
                  save a draft.
                </p>
              </div>
            </div>
          )}
        </Section>

        <LineItemEditor
          products={siteStock}
          lines={lines}
          onChange={setLines}
          priceMode="sell"
          checkAvailability
          emptyHint={`Add products to ship from ${warehouses.find((w) => w.id === warehouseId)?.code}. Availability is checked against that site, not the whole business.`}
        />
      </div>

      <div className="grid content-start gap-4">
        <Section title="Order summary">
          <div className="grid gap-3">
            <StatTile label="Lines" value={lines.length} />
            <StatTile label="Units" value={qty(totals.units)} />
            <StatTile
              label="Order total"
              value={money(totals.total, { cents: true })}
              hint={shipping > 0 ? `includes ${money(shipping, { cents: true })} shipping` : undefined}
            />
            <StatTile
              label="Backorder"
              value={qty(backorderUnits)}
              tone={backorderUnits > 0 ? "warning" : "neutral"}
              hint={
                backorderUnits > 0
                  ? `${plural(shortLines.length, "line")} cannot be filled today`
                  : "Everything is available"
              }
            />
          </div>

          <div className="mt-4">
            <WorkflowStepper
              workflow="salesOrder"
              status={backorderUnits > 0 ? "confirmed" : "reserved"}
            />
          </div>
        </Section>

        {customer && (
          <Section title="Credit check" description="What this order does to the account.">
            <div className="grid gap-3">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-caption text-muted-foreground">After this order</span>
                  <span
                    className={cn(
                      "tabular text-[15px] font-bold",
                      overCredit
                        ? "text-status-danger"
                        : creditUsedAfter > 0.9
                          ? "text-status-warning"
                          : "text-status-success",
                    )}
                    data-numeric
                  >
                    {percent(Math.min(creditUsedAfter, 1), 0)}
                  </span>
                </div>
                <MeterBar
                  value={creditUsedAfter}
                  tone={overCredit ? "danger" : creditUsedAfter > 0.9 ? "warning" : "success"}
                  className="mt-2"
                  label={`${money(creditAfter)} against a ${money(customer.creditLimit)} limit`}
                />
                <p className="mt-1.5 text-caption text-muted-foreground">
                  {money(creditAfter)} of {money(customer.creditLimit)}
                  {!overCredit && ` · ${money(customer.creditLimit - creditAfter)} still available`}
                </p>
              </div>

              {overCredit && (
                <div className="rounded-md border border-status-danger-border bg-status-danger-bg p-3">
                  <p className="text-[13px] font-medium text-status-danger">
                    This order exceeds the credit limit
                  </p>
                  <p className="mt-1 text-caption leading-relaxed text-status-danger/90">
                    {money(creditAfter - customer.creditLimit)} over. Reduce the order, take payment
                    up front, or have Finance raise the limit before confirming.
                  </p>
                </div>
              )}
            </div>
          </Section>
        )}

        {shortLines.length > 0 && (
          <div className="rounded-lg border border-status-warning-border bg-status-warning-bg p-3">
            <p className="text-[13px] font-medium text-status-warning">
              {plural(backorderUnits, "unit")} would go on backorder
            </p>
            <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
              Confirming reserves what is available now; the shortfall becomes open demand and the
              order sits on backorder until stock arrives. Transferring stock in from another site
              is often faster than waiting for a supplier.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-8" disabled={!canSubmit} onClick={() => submit(false)}>
            <Send className="size-3.5" aria-hidden />
            Confirm order
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={lines.length === 0}
            onClick={() => submit(true)}
          >
            <Save className="size-3.5" aria-hidden />
            Save draft
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => router.push("/sales/orders")}
          >
            Cancel
          </Button>
        </div>

        {lines.length > 0 && !overCredit && !customerBlocked && (
          <div className="rounded-lg border p-3">
            <p className="text-caption text-muted-foreground">On confirmation</p>
            <ul className="mt-2 grid gap-1.5 text-caption">
              <li className="flex items-center gap-2">
                <StatusBadge label="Reserved" tone="purple" showDot={false} />
                <span>
                  {qty(totals.units - backorderUnits)} units stop being available to promise
                </span>
              </li>
              <li className="flex items-center gap-2">
                <StatusBadge label="Picking" tone="info" showDot={false} />
                <span>the order joins the pick queue at {warehouses.find((w) => w.id === warehouseId)?.code}</span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
