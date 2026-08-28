"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Save, Send, TriangleAlert } from "lucide-react";
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
import { money, percent, plural, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PoSupplier {
  id: string;
  code: string;
  name: string;
  leadTimeDays: number;
  paymentTerms: string;
  onTimeRate: number;
  defectRate: number;
  status: string;
}

export interface PoProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  unitCost: number;
  sellPrice: number;
  available: number;
  supplierIds: string[];
  /** Suggested order quantity when this SKU is below its reorder point. */
  suggestedQty: number;
  belowReorder: boolean;
  reorderPoint: number;
}

/** Orders above this need a purchasing manager to sign off. */
const APPROVAL_THRESHOLD = 5000;

export function PoForm({
  suppliers,
  products,
  warehouses,
}: {
  suppliers: PoSupplier[];
  products: PoProduct[];
  warehouses: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = React.useState(suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = React.useState(warehouses[0]?.id ?? "");
  const [shipping, setShipping] = React.useState(0);
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<EditorLine[]>([]);

  const supplierLabels = React.useMemo(
    () => Object.fromEntries(suppliers.map((s) => [s.id, `${s.name} · ${s.code}`])),
    [suppliers],
  );
  const warehouseLabels = React.useMemo(
    () => Object.fromEntries(warehouses.map((w) => [w.id, `${w.code} · ${w.name}`])),
    [warehouses],
  );

  const supplier = suppliers.find((s) => s.id === supplierId);

  // Only what this supplier can actually provide. Changing supplier clears the
  // lines, because a PO is a contract with one supplier at their prices.
  const catalogue = React.useMemo(
    () =>
      products
        .filter((p) => p.supplierIds.includes(supplierId))
        .map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          unitCost: p.unitCost,
          sellPrice: p.sellPrice,
          available: p.available,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products, supplierId],
  );

  const suggestions = React.useMemo(
    () =>
      products
        .filter((p) => p.supplierIds.includes(supplierId) && p.belowReorder)
        .sort((a, b) => a.available - b.available)
        .slice(0, 8),
    [products, supplierId],
  );

  const changeSupplier = (next: string) => {
    if (next === supplierId) return;
    if (lines.length > 0) {
      setLines([]);
      toast.info("Lines cleared", {
        description: "An order is placed with one supplier at their prices.",
      });
    }
    setSupplierId(next);
  };

  const addSuggestion = (p: PoProduct) => {
    if (lines.some((l) => l.product.id === p.id)) {
      toast.info(`${p.sku} is already on this order`);
      return;
    }
    setLines((current) => [
      ...current,
      {
        key: `${p.id}-${current.length}`,
        product: {
          id: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          unitCost: p.unitCost,
          sellPrice: p.sellPrice,
          available: p.available,
        },
        quantity: p.suggestedQty,
        unitPrice: p.unitCost,
        discountPct: 0,
        taxPct: 0,
      },
    ]);
  };

  const addAllSuggestions = () => {
    const missing = suggestions.filter((p) => !lines.some((l) => l.product.id === p.id));
    if (missing.length === 0) {
      toast.info("Every suggestion is already on this order");
      return;
    }
    setLines((current) => [
      ...current,
      ...missing.map((p, i) => ({
        key: `${p.id}-${current.length + i}`,
        product: {
          id: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          unitCost: p.unitCost,
          sellPrice: p.sellPrice,
          available: p.available,
        },
        quantity: p.suggestedQty,
        unitPrice: p.unitCost,
        discountPct: 0,
        taxPct: 0,
      })),
    ]);
    toast.success(`${plural(missing.length, "line")} added from purchase suggestions`);
  };

  const totals = lineTotals(lines, shipping);
  const needsApproval = totals.total > APPROVAL_THRESHOLD;
  const supplierOnHold = supplier?.status !== "active";
  const canSubmit = lines.length > 0 && !supplierOnHold;

  const submit = (asDraft: boolean) => {
    if (!asDraft && !canSubmit) return;
    toast.success(
      asDraft
        ? "Purchase order saved as a draft"
        : needsApproval
          ? "Purchase order submitted for approval"
          : "Purchase order placed",
      {
        description: asDraft
          ? "Nothing is committed. Finish it later from the purchase orders list."
          : needsApproval
            ? `${money(totals.total, { cents: true })} is above the ${money(APPROVAL_THRESHOLD)} threshold, so a purchasing manager has to sign it off before it reaches ${supplier?.name}.`
            : `Sent to ${supplier?.name}. ${qty(totals.units)} units booked as incoming at ${warehouses.find((w) => w.id === warehouseId)?.code}.`,
      },
    );
    router.push("/purchasing/purchase-orders");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section title="Supplier and destination" description="An order is placed with one supplier, into one site.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="supplier">Supplier</Label>
              <Select items={supplierLabels} value={supplierId} onValueChange={(v) => changeSupplier(v ?? "")}>
                <SelectTrigger id="supplier" className={cn(supplierOnHold && "border-status-warning")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {supplier && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
                  <span>{supplier.leadTimeDays}-day lead time</span>
                  <span>·</span>
                  <span>{supplier.paymentTerms}</span>
                  <span>·</span>
                  <span
                    className={cn(
                      supplier.onTimeRate < 0.85 && "font-medium text-status-warning",
                    )}
                  >
                    {percent(supplier.onTimeRate, 1)} on time
                  </span>
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="warehouse">Deliver to</Label>
              <Select items={warehouseLabels} value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? "")}>
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
              <Label htmlFor="notes">Delivery notes</Label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Dock, times, labelling requirements."
              />
            </div>
          </div>

          {supplierOnHold && supplier && (
            <div className="mt-4 flex items-start gap-3 rounded-md border border-status-warning-border bg-status-warning-bg p-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-status-warning">
                  {supplier.name} is {supplier.status === "on-hold" ? "on hold" : "inactive"}
                </p>
                <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
                  New orders cannot be placed with this supplier until the hold is lifted. Save a
                  draft, or pick a different supplier for these lines.
                </p>
              </div>
            </div>
          )}
        </Section>

        {suggestions.length > 0 && (
          <Section
            title="Purchase suggestions"
            description={`${plural(suggestions.length, "SKU")} from this supplier are below their reorder point.`}
            actions={
              <Button variant="outline" size="sm" className="h-7" onClick={addAllSuggestions}>
                <Lightbulb className="size-3.5" aria-hidden />
                Add all
              </Button>
            }
            contentClassName="p-0"
          >
            <ul className="divide-y">
              {suggestions.map((p) => {
                const added = lines.some((l) => l.product.id === p.id);
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-[13px] font-medium">{p.name}</span>
                      <span className="text-code text-[11px] text-muted-foreground">
                        {p.sku} · {qty(p.available)} available, reorder at {qty(p.reorderPoint)}
                      </span>
                    </span>
                    <StatusBadge
                      label={p.available === 0 ? "Out of stock" : "Below reorder point"}
                      tone={p.available === 0 ? "danger" : "warning"}
                    />
                    <span className="tabular w-24 text-right text-[13px]" data-numeric>
                      {qty(p.suggestedQty)} {p.unit}
                    </span>
                    <Button
                      variant={added ? "ghost" : "outline"}
                      size="sm"
                      className="h-7"
                      disabled={added}
                      onClick={() => addSuggestion(p)}
                    >
                      {added ? "Added" : "Add"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        <LineItemEditor
          products={catalogue}
          lines={lines}
          onChange={setLines}
          priceMode="cost"
          emptyHint={
            catalogue.length === 0
              ? "This supplier has no products linked to them yet."
              : `Add products supplied by ${supplier?.name}. Prices default to the standard unit cost.`
          }
        />
      </div>

      <div className="grid content-start gap-4">
        <Section title="Order summary" description="What placing this order commits.">
          <div className="grid gap-3">
            <StatTile label="Lines" value={lines.length} />
            <StatTile label="Units" value={qty(totals.units)} />
            <StatTile
              label="Order total"
              value={money(totals.total, { cents: true })}
              hint={shipping > 0 ? `includes ${money(shipping, { cents: true })} shipping` : undefined}
            />
            <StatTile
              label="Approval"
              value={needsApproval ? "Required" : "Not required"}
              tone={needsApproval ? "warning" : "neutral"}
              hint={
                needsApproval
                  ? `Above the ${money(APPROVAL_THRESHOLD)} threshold`
                  : `Under the ${money(APPROVAL_THRESHOLD)} threshold — goes straight to the supplier`
              }
            />
            {supplier && lines.length > 0 && (
              <StatTile
                label="Expected delivery"
                value={`${supplier.leadTimeDays} days`}
                hint={`Based on ${supplier.name}'s lead time`}
              />
            )}
          </div>

          <div className="mt-4">
            <WorkflowStepper
              workflow="purchaseOrder"
              status={needsApproval ? "submitted" : "ordered"}
            />
          </div>
        </Section>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-8" disabled={!canSubmit} onClick={() => submit(false)}>
            <Send className="size-3.5" aria-hidden />
            {needsApproval ? "Submit for approval" : "Place order"}
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
            onClick={() => router.push("/purchasing/purchase-orders")}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
