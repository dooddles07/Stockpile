"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
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
import { humanize } from "@/lib/status";
import { cn } from "@/lib/utils";
import { submitAdjustment, type AdjustmentFormState } from "./actions";

export interface Holding {
  productId: string;
  sku: string;
  productName: string;
  warehouseId: string;
  locationId: string;
  locationCode: string;
  lotNumber: string | null;
  onHand: number;
}

const REASONS: { value: string; hint: string }[] = [
  { value: "damaged", hint: "Units are physically unusable — moved into the damaged balance, not just removed." },
  { value: "lost", hint: "Stock cannot be located after a search of the area." },
  { value: "found", hint: "Stock located that the system did not know about." },
  { value: "expired", hint: "Shelf life has passed; units are quarantined and written off." },
  { value: "count-error", hint: "A count found a discrepancy against the recorded quantity." },
  { value: "manual-correction", hint: "A known data-entry error being corrected." },
  { value: "internal-use", hint: "Consumed by the business rather than sold." },
  { value: "other", hint: "Anything else. Explain it in the note." },
];
const REASON_LABELS = Object.fromEntries(REASONS.map((r) => [r.value, humanize(r.value)]));
const DIRECTION_LABELS = { add: "Add to on-hand", remove: "Remove from on-hand" };

/** A note is what an auditor reads six months later — insist on one here. */
const NOTE_REQUIRED = new Set(["other", "lost"]);
const HOLDING_SEP = "::";

const INITIAL: AdjustmentFormState = { status: "idle" };

export function RecordAdjustmentForm({
  warehouses,
  holdings,
}: {
  warehouses: { id: string; code: string; name: string }[];
  holdings: Holding[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = React.useActionState(submitAdjustment, INITIAL);

  const [warehouseId, setWarehouseId] = React.useState(warehouses[0]?.id ?? "");
  const [productChoice, setProductChoice] = React.useState("");
  const [holdingChoice, setHoldingChoice] = React.useState("");
  const [reason, setReason] = React.useState("count-error");
  // Null = follow the reason; a value = the operator overrode it.
  const [directionOverride, setDirectionOverride] = React.useState<"add" | "remove" | null>(null);
  const [quantity, setQuantity] = React.useState("1");
  const [note, setNote] = React.useState("");

  const direction = directionOverride ?? (reason === "found" ? "add" : "remove");

  // Products that have at least one holding in the chosen warehouse.
  const products = React.useMemo(() => {
    const byId = new Map<string, { id: string; label: string }>();
    for (const h of holdings) {
      if (h.warehouseId !== warehouseId) continue;
      if (!byId.has(h.productId)) {
        byId.set(h.productId, { id: h.productId, label: `${h.productName} · ${h.sku}` });
      }
    }
    return [...byId.values()];
  }, [holdings, warehouseId]);
  const productLabels = React.useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p.label])),
    [products],
  );
  // Derived, not stored: a choice that no longer matches the warehouse is blank.
  const productId = products.some((p) => p.id === productChoice) ? productChoice : "";

  const locationOptions = React.useMemo(
    () =>
      holdings
        .filter((h) => h.warehouseId === warehouseId && h.productId === productId)
        .map((h) => ({
          key: `${h.locationId}${HOLDING_SEP}${h.lotNumber ?? ""}`,
          onHand: h.onHand,
          label: `${h.locationCode}${h.lotNumber ? ` · lot ${h.lotNumber}` : ""} — ${h.onHand} on hand`,
        })),
    [holdings, warehouseId, productId],
  );
  const locationLabels = React.useMemo(
    () => Object.fromEntries(locationOptions.map((o) => [o.key, o.label])),
    [locationOptions],
  );
  const holdingKey = locationOptions.some((o) => o.key === holdingChoice) ? holdingChoice : "";
  const selectedHolding = locationOptions.find((o) => o.key === holdingKey) ?? null;
  const [locationId, lotNumber] = holdingKey.split(HOLDING_SEP);

  const noteMissing = NOTE_REQUIRED.has(reason) && note.trim().length === 0;
  const qtyValue = Number(quantity);
  const qtyValid = Number.isInteger(qtyValue) && qtyValue > 0;
  const wouldGoNegative =
    direction === "remove" && selectedHolding !== null && qtyValid && qtyValue > selectedHolding.onHand;
  const canSubmit = !pending && productId !== "" && holdingKey !== "" && qtyValid && !noteMissing;

  // Toast on each new action result. `revalidatePath` in the action already
  // freshens the ledger and stock reads for the next navigation; the result
  // panel below shows the new balance, so there is nothing to refresh here.
  const lastHandled = React.useRef<AdjustmentFormState>(INITIAL);
  React.useEffect(() => {
    if (state === lastHandled.current) return;
    lastHandled.current = state;
    if (state.status === "success") {
      toast.success("Adjustment recorded", { description: state.message });
    } else if (state.status === "error") {
      toast.error("Adjustment not recorded", { description: state.message });
    }
  }, [state]);

  return (
    <form action={formAction} className="grid gap-4 lg:grid-cols-3">
      <input type="hidden" name="warehouseId" value={warehouseId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="locationId" value={locationId ?? ""} />
      <input type="hidden" name="lotNumber" value={lotNumber ?? ""} />
      <input type="hidden" name="reason" value={reason} />
      <input type="hidden" name="direction" value={direction} />

      <div className="grid content-start gap-4 lg:col-span-2">
        <Section title="What is being adjusted" description="The exact holding whose recorded quantity is wrong.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="warehouse">Warehouse</Label>
              <Select
                items={Object.fromEntries(warehouses.map((w) => [w.id, `${w.code} · ${w.name}`]))}
                value={warehouseId}
                onValueChange={(v) => {
                  setWarehouseId(v ?? "");
                  setProductChoice("");
                  setHoldingChoice("");
                }}
              >
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
              <Label htmlFor="product">Product</Label>
              <Select
                items={productLabels}
                value={productId}
                onValueChange={(v) => {
                  setProductChoice(v ?? "");
                  setHoldingChoice("");
                }}
              >
                <SelectTrigger id="product">
                  <SelectValue placeholder="Choose a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="holding">Location &amp; lot</Label>
              <Select
                items={locationLabels}
                value={holdingKey}
                onValueChange={(v) => setHoldingChoice(v ?? "")}
                disabled={productId === "" || locationOptions.length === 0}
              >
                <SelectTrigger id="holding">
                  <SelectValue
                    placeholder={
                      productId === ""
                        ? "Choose a product first"
                        : locationOptions.length === 0
                          ? "No stock rows for this product here"
                          : "Choose the location"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {locationOptions.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reason">Reason</Label>
              <Select
                items={REASON_LABELS}
                value={reason}
                onValueChange={(v) => {
                  setReason(v ?? "count-error");
                  setDirectionOverride(null);
                }}
              >
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

            <div className="grid gap-2">
              <Label htmlFor="direction">Direction</Label>
              <Select
                items={DIRECTION_LABELS}
                value={direction}
                onValueChange={(v) => setDirectionOverride((v as "add" | "remove") ?? "remove")}
              >
                <SelectTrigger id="direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="remove">Remove from on-hand</SelectItem>
                  <SelectItem value="add">Add to on-hand</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min={1}
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={!qtyValid || wouldGoNegative || undefined}
                className={cn((!qtyValid || wouldGoNegative) && "border-destructive")}
              />
              {wouldGoNegative && (
                <p className="text-caption text-destructive">
                  Only {selectedHolding?.onHand} on hand — removing {qtyValue} would take it below zero.
                </p>
              )}
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="note">
                Note {NOTE_REQUIRED.has(reason) && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                id="note"
                name="note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What happened, and anything an auditor would need to know."
                aria-invalid={noteMissing || undefined}
                className={cn(noteMissing && "border-destructive")}
              />
              {noteMissing && (
                <p className="text-caption text-destructive">
                  A note is required for {humanize(reason).toLowerCase()} adjustments.
                </p>
              )}
            </div>
          </div>
        </Section>
      </div>

      <div className="grid content-start gap-4">
        <Section title="Result" description="Submitting writes straight to the ledger.">
          <div className="grid gap-3">
            <StatTile
              label="Current on-hand"
              value={selectedHolding ? String(selectedHolding.onHand) : "—"}
            />
            {state.status === "success" && (
              <>
                <StatTile label="New on-hand" value={String(state.onHand)} tone="success" />
                {state.damaged > 0 && (
                  <StatTile label="Damaged balance" value={String(state.damaged)} tone="warning" />
                )}
                <p className="text-caption text-muted-foreground">
                  Movement <span className="text-code">{state.movementId}</span> written to the ledger.
                </p>
              </>
            )}
            {state.status === "error" && (
              <p className="text-caption text-destructive" role="alert">
                {state.message}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" size="sm" className="h-8" disabled={!canSubmit}>
              <Send className="size-3.5" aria-hidden />
              {pending ? "Recording…" : "Record adjustment"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => router.push("/inventory/adjustments")}
            >
              Cancel
            </Button>
          </div>
        </Section>
      </div>
    </form>
  );
}
