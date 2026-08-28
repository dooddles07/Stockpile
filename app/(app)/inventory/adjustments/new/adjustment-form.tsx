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
import { LineItemEditor, type EditorLine, type PickableProduct } from "@/components/record/line-item-editor";
import { WorkflowStepper } from "@/components/status/workflow-stepper";
import { money, qty, signed, signedMoney } from "@/lib/format";
import { humanize } from "@/lib/status";
import { cn } from "@/lib/utils";

const REASONS = [
  { value: "damaged", hint: "Units are physically unusable and are being written off." },
  { value: "lost", hint: "Stock cannot be located after a search of the area." },
  { value: "found", hint: "Stock located that the system did not know about." },
  { value: "expired", hint: "Shelf life has passed; units are quarantined and written off." },
  { value: "count-error", hint: "A count found a discrepancy against the recorded quantity." },
  { value: "manual-correction", hint: "A known data-entry error being corrected." },
  { value: "internal-use", hint: "Consumed by the business rather than sold." },
  { value: "other", hint: "Anything else. Explain it in the note." },
];

/** Base UI needs a value→label map or Select.Value renders the raw value. */
const REASON_LABELS = Object.fromEntries(REASONS.map((r) => [r.value, humanize(r.value)]));

/** Anything moving more than this much value needs a second pair of eyes. */
const APPROVAL_THRESHOLD = 500;

export interface AdjustmentDraft {
  number: string;
  warehouseId: string;
  reason: string;
  note: string;
  lines: EditorLine[];
  /** Signed quantities as stored on the draft, keyed by line. */
  deltas: Record<string, number>;
}

export function AdjustmentForm({
  warehouses,
  products,
  initial,
  returnTo = "/inventory/adjustments",
}: {
  warehouses: { id: string; code: string; name: string }[];
  products: PickableProduct[];
  /** Present when reopening a draft. */
  initial?: AdjustmentDraft;
  returnTo?: string;
}) {
  const router = useRouter();
  const editing = initial !== undefined;
  const warehouseLabels = React.useMemo(
    () => Object.fromEntries(warehouses.map((w) => [w.id, `${w.code} · ${w.name}`])),
    [warehouses],
  );
  const [warehouseId, setWarehouseId] = React.useState(
    initial?.warehouseId ?? warehouses[0]?.id ?? "",
  );
  const [reason, setReason] = React.useState(initial?.reason ?? "damaged");
  const [note, setNote] = React.useState(initial?.note ?? "");
  const [lines, setLines] = React.useState<EditorLine[]>(initial?.lines ?? []);
  // Positive for "found", negative for everything else — the direction follows
  // the reason, so an operator cannot accidentally add stock by writing it off.
  const [deltas, setDeltas] = React.useState<Record<string, number>>(initial?.deltas ?? {});

  const direction = reason === "found" ? 1 : -1;

  const resolved = lines.map((line) => {
    const magnitude = Math.abs(deltas[line.key] ?? line.quantity);
    const delta = direction * magnitude;
    return {
      line,
      delta,
      valueImpact: delta * line.product.unitCost,
      exceedsStock: direction < 0 && magnitude > line.product.available,
    };
  });

  const totalDelta = resolved.reduce((s, r) => s + r.delta, 0);
  const totalValue = resolved.reduce((s, r) => s + r.valueImpact, 0);
  const needsApproval = Math.abs(totalValue) > APPROVAL_THRESHOLD;
  const blocking = resolved.filter((r) => r.exceedsStock);
  const noteRequired = reason === "other" || reason === "lost";
  const noteMissing = noteRequired && note.trim().length === 0;
  const canSubmit = lines.length > 0 && blocking.length === 0 && !noteMissing;

  const submit = (asDraft: boolean) => {
    if (!canSubmit && !asDraft) return;
    toast.success(asDraft ? (editing ? `${initial.number} saved` : "Adjustment saved as a draft") : needsApproval ? "Adjustment submitted for approval" : "Adjustment posted to stock", {
      description: asDraft
        ? "Nothing has been posted. You can finish it later from the adjustments list."
        : needsApproval
          ? `${money(Math.abs(totalValue), { cents: true })} of value is above the ${money(APPROVAL_THRESHOLD)} threshold, so an inventory manager has to sign it off.`
          : `${signed(totalDelta)} units written to the ledger at ${warehouses.find((w) => w.id === warehouseId)?.code}.`,
    });
    router.push(returnTo);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section title="What is being adjusted" description="The site and the reason drive everything else.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="warehouse">Warehouse</Label>
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
              <Label htmlFor="reason">Reason</Label>
              <Select items={REASON_LABELS} value={reason} onValueChange={(v) => setReason(v ?? "damaged")}>
                <SelectTrigger id="reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {humanize(r.value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">
                {REASONS.find((r) => r.value === reason)?.hint}
              </p>
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="note">
                Note {noteRequired && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                id="note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What happened, and anything an approver or auditor would need to know."
                aria-invalid={noteMissing || undefined}
                className={cn(noteMissing && "border-destructive")}
              />
              {noteMissing && (
                <p className="text-caption text-destructive">
                  A note is required for {humanize(reason).toLowerCase()} adjustments — this is what an
                  auditor reads six months from now.
                </p>
              )}
            </div>
          </div>
        </Section>

        <LineItemEditor
          products={products}
          lines={lines}
          onChange={setLines}
          showPricing={false}
          showDiscount={false}
          showTax={false}
          emptyHint="Add the SKUs whose quantity is changing. The direction is set by the reason above."
        />

        {lines.length > 0 && (
          <Section
            title="Quantity change"
            description={
              direction > 0
                ? "Found stock is added to the recorded quantity."
                : "These quantities are removed from the recorded quantity."
            }
            contentClassName="p-0"
          >
            <ul className="divide-y">
              {resolved.map(({ line, delta, valueImpact, exceedsStock }) => (
                <li key={line.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[13px] font-medium">{line.product.name}</span>
                    <span className="text-code text-[11px] text-muted-foreground">
                      {line.product.sku} · {qty(line.product.available)} available
                    </span>
                    {exceedsStock && (
                      <span className="text-[11px] font-medium text-destructive">
                        Cannot remove {qty(Math.abs(delta))} — only {qty(line.product.available)} available.
                        Negative stock is disabled in settings.
                      </span>
                    )}
                  </span>

                  <div className="flex items-center gap-2">
                    <Label htmlFor={`delta-${line.key}`} className="text-caption text-muted-foreground">
                      {direction > 0 ? "Add" : "Remove"}
                    </Label>
                    <Input
                      id={`delta-${line.key}`}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={Math.abs(deltas[line.key] ?? line.quantity)}
                      onChange={(e) =>
                        setDeltas((d) => ({
                          ...d,
                          [line.key]: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      className={cn("h-8 w-24 text-right tabular", exceedsStock && "border-destructive")}
                    />
                  </div>

                  <span
                    className={cn(
                      "w-28 shrink-0 text-right text-[13px] font-semibold tabular",
                      valueImpact >= 0 ? "text-status-success" : "text-status-danger",
                    )}
                    data-numeric
                  >
                    {signedMoney(valueImpact)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <div className="grid content-start gap-4">
        <Section title="Impact" description="What posting this adjustment will do.">
          <div className="grid gap-3">
            <StatTile
              label="Unit change"
              value={signed(totalDelta)}
              tone={totalDelta >= 0 ? "success" : "danger"}
            />
            <StatTile
              label="Value impact"
              value={signedMoney(totalValue)}
              tone={totalValue >= 0 ? "success" : "danger"}
              hint="At current unit cost"
            />
            <StatTile
              label="Approval"
              value={needsApproval ? "Required" : "Not required"}
              tone={needsApproval ? "warning" : "neutral"}
              hint={
                needsApproval
                  ? `Above the ${money(APPROVAL_THRESHOLD)} threshold`
                  : `Under the ${money(APPROVAL_THRESHOLD)} threshold — posts immediately`
              }
            />
          </div>

          <div className="mt-4">
            <WorkflowStepper
              workflow="adjustment"
              status={needsApproval ? "pending-approval" : "applied"}
            />
          </div>
        </Section>

        {blocking.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-status-danger-border bg-status-danger-bg p-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-danger" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-status-danger">
                {blocking.length} line{blocking.length === 1 ? "" : "s"} would take stock negative
              </p>
              <p className="mt-1 text-caption leading-relaxed text-status-danger/90">
                Reduce the quantities, or raise a stock count first if you believe the recorded
                figure is wrong.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-8" disabled={!canSubmit} onClick={() => submit(false)}>
            <Send className="size-3.5" aria-hidden />
            {needsApproval ? "Submit for approval" : "Post adjustment"}
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
            onClick={() => router.push(returnTo)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
