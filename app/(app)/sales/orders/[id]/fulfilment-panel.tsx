"use client";

import * as React from "react";
import { ClipboardList, Container, ScanLine, Truck } from "lucide-react";
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
import { StatusBadge } from "@/components/status/status-badge";
import { MeterBar } from "@/components/status/meter-bar";
import { money, percent, plural, qty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FulfilmentActionButton } from "./fulfilment-actions";

export interface FulfilLine {
  id: string;
  sku: string;
  name: string;
  locationCode: string;
  ordered: number;
  alreadyPicked: number;
  available: number;
  unitPrice: number;
}

const CARRIERS = [
  "Anchor Parcel",
  "Meridian Freight",
  "Cascade Express",
  "Harbor Line Logistics",
  "Redstone Haulage",
];

const BOXES = ["Small carton", "Medium carton", "Large carton", "Pallet"];

/**
 * Picking, packing and despatch on one screen.
 *
 * These are three stages of the same job for the same person, and splitting
 * them across three routes means walking back to a list between each. The
 * stage the order is actually at decides which section is live.
 */
export function FulfilmentPanel({
  salesOrderId,
  stage,
  lines,
  customer,
  shipToCity,
}: {
  salesOrderId: string;
  stage: "confirmed" | "reserved" | "picking" | "packing";
  lines: FulfilLine[];
  customer: string;
  shipToCity: string;
}) {
  const [picked, setPicked] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, l.alreadyPicked])),
  );
  const [carrier, setCarrier] = React.useState(CARRIERS[0]);
  const [box, setBox] = React.useState(BOXES[1]);
  const [weight, setWeight] = React.useState(0);

  const carrierLabels = React.useMemo(
    () => Object.fromEntries(CARRIERS.map((c) => [c, c])),
    [],
  );
  const boxLabels = React.useMemo(() => Object.fromEntries(BOXES.map((b) => [b, b])), []);

  const resolved = lines.map((line) => {
    const count = picked[line.id] ?? 0;
    return {
      line,
      picked: count,
      short: count < line.ordered,
      // Picking more than the shelf holds is the classic way a pick list and
      // the recorded quantity drift apart.
      overAvailable: count > line.available + line.alreadyPicked,
    };
  });

  const orderedUnits = lines.reduce((s, l) => s + l.ordered, 0);
  const pickedUnits = resolved.reduce((s, r) => s + r.picked, 0);
  const shortLines = resolved.filter((r) => r.short);
  const blocking = resolved.filter((r) => r.overAvailable);
  const progress = orderedUnits > 0 ? pickedUnits / orderedUnits : 0;
  const pickedValue = resolved.reduce((s, r) => s + r.picked * r.line.unitPrice, 0);
  const complete = pickedUnits >= orderedUnits;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section
          title="Pick list"
          description="Ordered by bin so the walk is one pass through the aisles, not a search."
          actions={
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() =>
                toast.info("Scanner ready", {
                  description: "Scan a bin label, then the product, then key the quantity.",
                })
              }
            >
              <ScanLine className="size-3.5" aria-hidden />
              Scan
            </Button>
          }
          contentClassName="p-0"
        >
          <ul className="divide-y">
            {resolved
              .slice()
              .sort((a, b) => a.line.locationCode.localeCompare(b.line.locationCode))
              .map(({ line, picked: count, short, overAvailable }) => (
                <li key={line.id} className="grid gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="text-code shrink-0 rounded border bg-surface-sunken px-2 py-1 text-[12px] font-semibold">
                        {line.locationCode}
                      </span>
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate text-[13px] font-medium">{line.name}</span>
                        <span className="text-code text-[11px] text-muted-foreground">
                          {line.sku} · {qty(line.available)} on the shelf
                        </span>
                      </span>
                    </span>

                    <div className="flex items-end gap-3">
                      <div className="grid gap-1.5">
                        <Label
                          htmlFor={`pick-${line.id}`}
                          className="text-caption text-muted-foreground"
                        >
                          Picked
                        </Label>
                        <Input
                          id={`pick-${line.id}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={count}
                          onChange={(e) =>
                            setPicked((p) => ({
                              ...p,
                              [line.id]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          className={cn(
                            "h-8 w-24 text-right tabular",
                            short && "border-status-warning",
                            overAvailable && "border-destructive",
                          )}
                        />
                      </div>

                      <div className="grid gap-1.5">
                        <span className="text-caption text-muted-foreground">Ordered</span>
                        <output className="flex h-8 w-24 items-center justify-end rounded-md border bg-surface-sunken px-3 text-[13px] tabular">
                          {qty(line.ordered)}
                        </output>
                      </div>
                    </div>
                  </div>

                  {(short || overAvailable) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {overAvailable && (
                        <StatusBadge
                          label={`Only ${qty(line.available)} on the shelf`}
                          tone="danger"
                        />
                      )}
                      {short && !overAvailable && (
                        <StatusBadge
                          label={`Short by ${qty(line.ordered - count)} — goes on backorder`}
                          tone="warning"
                        />
                      )}
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </Section>

        {(stage === "picking" || stage === "packing") && (
          <Section
            title="Pack and manifest"
            description="Box, weight and carrier. Closing the manifest ships the order."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="box">Box</Label>
                <Select items={boxLabels} value={box} onValueChange={(v) => setBox(v ?? BOXES[1])}>
                  <SelectTrigger id="box">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOXES.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="weight">Gross weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  min={0}
                  step="0.1"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(Math.max(0, Number(e.target.value) || 0))}
                  className="text-right tabular"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="carrier">Carrier</Label>
                <Select
                  items={carrierLabels}
                  value={carrier}
                  onValueChange={(v) => setCarrier(v ?? CARRIERS[0])}
                >
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
            </div>

            <p className="mt-3 text-caption text-muted-foreground">
              Shipping to {customer} in {shipToCity}.
            </p>
          </Section>
        )}
      </div>

      <div className="grid content-start gap-4">
        <Section title="Progress" description="Where this order has got to.">
          <div className="grid gap-4">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-caption text-muted-foreground">Units picked</span>
                <span className="tabular text-[15px] font-bold" data-numeric>
                  {qty(pickedUnits)} / {qty(orderedUnits)}
                </span>
              </div>
              <MeterBar
                value={progress}
                tone={complete ? "success" : "info"}
                className="mt-2"
                label={`${percent(progress, 0)} of the order picked`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatTile
                label="Lines short"
                value={qty(shortLines.length)}
                tone={shortLines.length > 0 ? "warning" : "success"}
              />
              <StatTile label="Value picked" value={money(pickedValue)} />
            </div>

            {shortLines.length > 0 && (
              <div className="rounded-md border border-status-warning-border bg-status-warning-bg p-3">
                <p className="text-[13px] font-medium text-status-warning">
                  {plural(shortLines.length, "line")} cannot be filled
                </p>
                <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
                  Shipping this order short moves the outstanding quantity to backorder. The
                  customer is notified and the shortfall stays as open demand against the SKU.
                </p>
              </div>
            )}
          </div>
        </Section>

        <div className="flex flex-wrap gap-2">
          {stage === "confirmed" && (
            <FulfilmentActionButton
              salesOrderId={salesOrderId}
              intent="reserve"
              pendingLabel="Reserving…"
              className="h-8"
            >
              <ClipboardList className="size-3.5" aria-hidden />
              Reserve stock
            </FulfilmentActionButton>
          )}

          {stage === "reserved" && (
            <FulfilmentActionButton
              salesOrderId={salesOrderId}
              intent="pick"
              pendingLabel="Releasing…"
              className="h-8"
            >
              <ClipboardList className="size-3.5" aria-hidden />
              Start picking
            </FulfilmentActionButton>
          )}

          {stage === "picking" && (
            <FulfilmentActionButton
              salesOrderId={salesOrderId}
              intent="pack"
              pendingLabel="Moving…"
              className="h-8"
              disabled={pickedUnits === 0 || blocking.length > 0}
            >
              <Container className="size-3.5" aria-hidden />
              Finish picking
            </FulfilmentActionButton>
          )}

          {stage === "packing" && (
            <FulfilmentActionButton
              salesOrderId={salesOrderId}
              intent="ship"
              pendingLabel="Shipping…"
              className="h-8"
              carrier={carrier}
              disabled={weight <= 0 || blocking.length > 0}
            >
              <Truck className="size-3.5" aria-hidden />
              Ship order
            </FulfilmentActionButton>
          )}
        </div>

        {stage === "packing" && weight <= 0 && (
          <p className="text-caption text-muted-foreground">
            Enter a gross weight before shipping — the carrier rates on it.
          </p>
        )}

        {blocking.length > 0 && (
          <p className="text-caption text-destructive">
            {plural(blocking.length, "line")} pick more than the shelf holds. Correct the quantity,
            or raise a stock count if the recorded figure looks wrong.
          </p>
        )}
      </div>
    </div>
  );
}
