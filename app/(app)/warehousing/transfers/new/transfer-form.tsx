"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section, StatTile } from "@/components/record/field-grid";
import { LineItemEditor, type EditorLine } from "@/components/record/line-item-editor";
import { WorkflowStepper } from "@/components/status/workflow-stepper";
import { StatusBadge } from "@/components/status/status-badge";
import { money, qty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { raiseTransfer } from "./actions";

export interface TransferStockRow {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  unitCost: number;
  sellPrice: number;
  warehouseId: string;
  available: number;
}

const REASONS = [
  "Rebalancing stock ahead of a regional promotion",
  "Replenishing a site that fell below its reorder point",
  "Consolidating slow-moving stock into the main DC",
  "Moving inventory out of a site scheduled for maintenance",
  "Covering a confirmed sales order the destination cannot fill",
];

const CARRIERS = [
  "Meridian Freight",
  "Cascade Express",
  "Harbor Line Logistics",
  "Redstone Haulage",
  "Anchor Parcel",
];

/** Above this, a transfer needs an inventory manager to sign it off. */
const APPROVAL_THRESHOLD = 2000;

export function TransferForm({
  warehouses,
  stock,
}: {
  warehouses: { id: string; code: string; name: string }[];
  stock: TransferStockRow[];
}) {
  const router = useRouter();
  const [fromId, setFromId] = React.useState(warehouses[0]?.id ?? "");
  const [toId, setToId] = React.useState(warehouses[1]?.id ?? "");
  const [reason, setReason] = React.useState(REASONS[0]);
  const [carrier, setCarrier] = React.useState(CARRIERS[0]);
  const [expectedDays, setExpectedDays] = React.useState(5);
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<EditorLine[]>([]);
  const [saving, setSaving] = React.useState(false);

  const warehouseLabels = React.useMemo(
    () => Object.fromEntries(warehouses.map((w) => [w.id, `${w.code} · ${w.name}`])),
    [warehouses],
  );
  const reasonLabels = React.useMemo(
    () => Object.fromEntries(REASONS.map((r) => [r, r])),
    [],
  );
  const carrierLabels = React.useMemo(
    () => Object.fromEntries(CARRIERS.map((c) => [c, c])),
    [],
  );

  // Only what the source site actually holds can be moved out of it. Changing
  // the source therefore has to reset the lines, or you end up despatching
  // stock from a building that never had it.
  const sourceStock = React.useMemo(
    () =>
      stock
        .filter((s) => s.warehouseId === fromId && s.available > 0)
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
    [stock, fromId],
  );

  const changeSource = (next: string) => {
    if (next === fromId) return;
    if (lines.length > 0) {
      setLines([]);
      toast.info("Lines cleared", {
        description: "Only stock held at the source site can be transferred out of it.",
      });
    }
    setFromId(next);
    if (next === toId) {
      setToId(warehouses.find((w) => w.id !== next)?.id ?? "");
    }
  };

  const overCommitted = lines.filter((l) => l.quantity > l.product.available);
  const units = lines.reduce((s, l) => s + l.quantity, 0);
  const value = lines.reduce((s, l) => s + l.quantity * l.product.unitCost, 0);
  const needsApproval = value > APPROVAL_THRESHOLD;
  const sameSite = fromId === toId;
  const canSubmit = lines.length > 0 && overCommitted.length === 0 && !sameSite;

  // Raising a transfer stops at `draft` (ticket 08), and a draft moves no stock
  // and puts nothing in transit — approving it and then despatching it is what
  // does that. So there is one button here rather than a create/draft pair, and
  // the value threshold below is advice about the approval step ahead, not a
  // gate on this one.
  const create = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);

    const result = await raiseTransfer({
      fromWarehouseId: fromId,
      toWarehouseId: toId,
      reason,
      notes,
      carrier,
      expectedInDays: expectedDays,
      lines: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
    });

    if (!result.ok) {
      setSaving(false);
      toast.error("Transfer not raised", { description: result.message });
      return;
    }

    const fromCode = warehouses.find((w) => w.id === fromId)?.code;
    const toCode = warehouses.find((w) => w.id === toId)?.code;
    toast.success(`${result.number} raised as a draft`, {
      description: `${qty(units)} units, ${fromCode} → ${toCode}. Nothing moves and nothing is in transit until the transfer is approved and despatched.`,
    });
    router.push(`/warehousing/transfers/${result.id}`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section title="Route" description="Where the stock is coming from and going to.">
          <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <div className="grid gap-2">
              <Label htmlFor="from">Source</Label>
              <Select items={warehouseLabels} value={fromId} onValueChange={(v) => changeSource(v ?? "")}>
                <SelectTrigger id="from">
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

            <ArrowRight className="mx-auto mb-2.5 hidden size-4 text-muted-foreground sm:block" aria-hidden />

            <div className="grid gap-2">
              <Label htmlFor="to">Destination</Label>
              <Select items={warehouseLabels} value={toId} onValueChange={(v) => setToId(v ?? "")}>
                <SelectTrigger id="to" className={cn(sameSite && "border-destructive")}>
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
              {sameSite && (
                <p className="text-caption text-destructive">
                  Source and destination must be different sites.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="reason">Reason</Label>
              <Select items={reasonLabels} value={reason} onValueChange={(v) => setReason(v ?? REASONS[0])}>
                <SelectTrigger id="reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="expected">Transit days</Label>
              <Input
                id="expected"
                type="number"
                min={1}
                max={60}
                inputMode="numeric"
                value={expectedDays}
                onChange={(e) =>
                  // Clamped both ways: the server action rejects anything
                  // outside 1–60, and it can only answer that with the same
                  // generic "check the sites and the lines" message.
                  setExpectedDays(Math.min(60, Math.max(1, Number(e.target.value) || 1)))
                }
                className="text-right tabular"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="carrier">Carrier</Label>
              <Select items={carrierLabels} value={carrier} onValueChange={(v) => setCarrier(v ?? CARRIERS[0])}>
                <SelectTrigger id="carrier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARRIERS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the receiving site should know."
              />
            </div>
          </div>
        </Section>

        <LineItemEditor
          products={sourceStock}
          lines={lines}
          onChange={setLines}
          showPricing={false}
          showDiscount={false}
          showTax={false}
          checkAvailability
          emptyHint={
            sourceStock.length === 0
              ? "The selected source site has nothing available to transfer."
              : `Add SKUs to move out of ${warehouses.find((w) => w.id === fromId)?.code}. Only stock held there is offered.`
          }
        />
      </div>

      <div className="grid content-start gap-4">
        <Section title="Impact" description="What creating this transfer will do.">
          <div className="grid gap-3">
            <StatTile label="Lines" value={lines.length} />
            <StatTile label="Units moving" value={qty(units)} />
            <StatTile
              label="Value in motion"
              value={money(value)}
              hint="Counted as in-transit once despatched, not before"
            />
            <StatTile
              label="Approval"
              value={needsApproval ? "Required" : "Not required"}
              tone={needsApproval ? "warning" : "neutral"}
              hint={
                needsApproval
                  ? `Above the ${money(APPROVAL_THRESHOLD)} threshold`
                  : `Under the ${money(APPROVAL_THRESHOLD)} threshold`
              }
            />
          </div>

          <div className="mt-4">
            <WorkflowStepper workflow="transfer" status="draft" />
          </div>
        </Section>

        {overCommitted.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-status-danger-border bg-status-danger-bg p-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-danger" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-status-danger">
                {overCommitted.length} line{overCommitted.length === 1 ? "" : "s"} exceed available
                stock
              </p>
              <p className="mt-1 text-caption leading-relaxed text-status-danger/90">
                The draft itself moves nothing, but the despatch draws from what the source holds —
                a line above what is available there could never leave the building.
              </p>
            </div>
          </div>
        )}

        {lines.length > 0 && overCommitted.length === 0 && (
          <div className="rounded-lg border p-3">
            <p className="text-caption text-muted-foreground">On despatch</p>
            <ul className="mt-2 grid gap-1.5 text-caption">
              <li className="flex items-center gap-2">
                <StatusBadge label={warehouses.find((w) => w.id === fromId)?.code ?? ""} tone="info" showDot={false} />
                <span>{qty(units)} units leave on-hand, then sit in transit</span>
              </li>
              <li className="flex items-center gap-2">
                <StatusBadge label={warehouses.find((w) => w.id === toId)?.code ?? ""} tone="success" showDot={false} />
                <span>counts on arrival, not before</span>
              </li>
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-8" disabled={!canSubmit || saving} onClick={create}>
            <Save className="size-3.5" aria-hidden />
            {saving ? "Creating…" : "Create transfer"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={saving}
            onClick={() => router.push("/warehousing/transfers")}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
