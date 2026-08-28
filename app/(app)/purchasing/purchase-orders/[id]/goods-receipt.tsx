"use client";

import * as React from "react";
import { PackageCheck, ScanLine, TriangleAlert } from "lucide-react";
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
import { StatusBadge } from "@/components/status/status-badge";
import { money, plural, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ReceiptLine {
  id: string;
  sku: string;
  name: string;
  ordered: number;
  alreadyReceived: number;
  unitPrice: number;
  batchTracked: boolean;
  serialTracked: boolean;
  hasExpiry: boolean;
  shelfLifeDays: number | null;
}

/**
 * Booking a delivery in against its purchase order.
 *
 * The interesting cases are all the ones where the pallet does not match the
 * paperwork — short, over, damaged, or a rejected inspection — so each is
 * recordable per line and each is called out before the operator confirms.
 * Batch, serial and expiry inputs appear only for the SKUs that track them.
 */
export function GoodsReceipt({
  orderNumber,
  supplier,
  destination,
  lines,
  locations,
}: {
  orderNumber: string;
  supplier: string;
  destination: string;
  lines: ReceiptLine[];
  locations: { id: string; code: string }[];
}) {
  const outstanding = React.useMemo(
    () =>
      Object.fromEntries(
        lines.map((l) => [l.id, Math.max(0, l.ordered - l.alreadyReceived)] as const),
      ),
    [lines],
  );

  const [counts, setCounts] = React.useState<Record<string, number>>(outstanding);
  const [rejected, setRejected] = React.useState<Record<string, number>>({});
  const [lots, setLots] = React.useState<Record<string, string>>({});
  const [expiries, setExpiries] = React.useState<Record<string, string>>({});
  const [locationId, setLocationId] = React.useState(locations[0]?.id ?? "");
  const [note, setNote] = React.useState("");

  const locationLabels = React.useMemo(
    () => Object.fromEntries(locations.map((l) => [l.id, l.code])),
    [locations],
  );

  const resolved = lines.map((line) => {
    const due = outstanding[line.id];
    const received = counts[line.id] ?? 0;
    const rej = rejected[line.id] ?? 0;
    const accepted = Math.max(0, received - rej);
    return {
      line,
      due,
      received,
      rejected: rej,
      accepted,
      short: received < due,
      over: received > due,
      invalidReject: rej > received,
      // A tracked SKU cannot be put away without its identifier — that is the
      // whole point of tracking it.
      missingLot: line.batchTracked && received > 0 && !(lots[line.id] ?? "").trim(),
      missingExpiry: line.hasExpiry && received > 0 && !(expiries[line.id] ?? "").trim(),
    };
  });

  const totalDue = resolved.reduce((s, r) => s + r.due, 0);
  const totalReceived = resolved.reduce((s, r) => s + r.received, 0);
  const totalRejected = resolved.reduce((s, r) => s + r.rejected, 0);
  const totalAccepted = resolved.reduce((s, r) => s + r.accepted, 0);
  const acceptedValue = resolved.reduce((s, r) => s + r.accepted * r.line.unitPrice, 0);

  const discrepancies = resolved.filter((r) => r.short || r.over || r.rejected > 0);
  const blocking = resolved.filter((r) => r.invalidReject || r.missingLot || r.missingExpiry);
  const noteRequired = discrepancies.length > 0;
  const noteMissing = noteRequired && note.trim().length === 0;
  const canConfirm = totalReceived > 0 && blocking.length === 0 && !noteMissing;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section
          title="Check in the delivery"
          description="Quantities default to what is still outstanding. Change them to match what actually arrived."
          actions={
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() =>
                toast.info("Scanner ready", {
                  description: "Scan a barcode to jump to that line and enter a quantity.",
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
            {resolved.map(
              ({
                line,
                due,
                received,
                rejected: rej,
                accepted,
                short,
                over,
                invalidReject,
                missingLot,
                missingExpiry,
              }) => (
                <li key={line.id} className="grid gap-3 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-[13px] font-medium">{line.name}</span>
                      <span className="text-code text-[11px] text-muted-foreground">
                        {line.sku} · {qty(line.ordered)} ordered
                        {line.alreadyReceived > 0 && ` · ${qty(line.alreadyReceived)} already in`}
                      </span>
                    </span>

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor={`recv-${line.id}`} className="text-caption text-muted-foreground">
                          Received
                        </Label>
                        <Input
                          id={`recv-${line.id}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={received}
                          onChange={(e) =>
                            setCounts((c) => ({
                              ...c,
                              [line.id]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          className={cn(
                            "h-8 w-24 text-right tabular",
                            (short || over) && "border-status-warning",
                            invalidReject && "border-destructive",
                          )}
                        />
                      </div>

                      <div className="grid gap-1.5">
                        <Label htmlFor={`rej-${line.id}`} className="text-caption text-muted-foreground">
                          Rejected
                        </Label>
                        <Input
                          id={`rej-${line.id}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={rej}
                          onChange={(e) =>
                            setRejected((d) => ({
                              ...d,
                              [line.id]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          className={cn(
                            "h-8 w-24 text-right tabular",
                            invalidReject && "border-destructive",
                          )}
                        />
                      </div>

                      <div className="grid gap-1.5">
                        <span className="text-caption text-muted-foreground">Into stock</span>
                        <output className="flex h-8 w-24 items-center justify-end rounded-md border bg-surface-sunken px-3 text-[13px] font-semibold tabular">
                          {qty(accepted)}
                        </output>
                      </div>
                    </div>
                  </div>

                  {(line.batchTracked || line.hasExpiry || line.serialTracked) && received > 0 && (
                    <div className="grid gap-3 rounded-md border bg-surface-sunken p-3 sm:grid-cols-3">
                      {line.batchTracked && (
                        <div className="grid gap-1.5">
                          <Label htmlFor={`lot-${line.id}`} className="text-caption">
                            Lot number <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id={`lot-${line.id}`}
                            value={lots[line.id] ?? ""}
                            onChange={(e) => setLots((s) => ({ ...s, [line.id]: e.target.value }))}
                            placeholder="LOT-2026-0000"
                            className={cn("h-8 text-code", missingLot && "border-destructive")}
                          />
                        </div>
                      )}

                      {line.hasExpiry && (
                        <div className="grid gap-1.5">
                          <Label htmlFor={`exp-${line.id}`} className="text-caption">
                            Expiry date <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id={`exp-${line.id}`}
                            type="date"
                            value={expiries[line.id] ?? ""}
                            onChange={(e) =>
                              setExpiries((s) => ({ ...s, [line.id]: e.target.value }))
                            }
                            className={cn("h-8", missingExpiry && "border-destructive")}
                          />
                          {line.shelfLifeDays && (
                            <p className="text-[11px] text-muted-foreground">
                              {line.shelfLifeDays}-day shelf life from receipt
                            </p>
                          )}
                        </div>
                      )}

                      {line.serialTracked && (
                        <div className="grid gap-1.5">
                          <Label className="text-caption">Serial numbers</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() =>
                              toast.info(`Scan ${plural(accepted, "serial")}`, {
                                description: "Each unit is scanned individually before put-away.",
                              })
                            }
                          >
                            <ScanLine className="size-3.5" aria-hidden />
                            Scan {qty(accepted)}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {(short || over || rej > 0 || invalidReject || missingLot || missingExpiry) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {invalidReject && (
                        <StatusBadge
                          label={`Rejected (${qty(rej)}) exceeds received (${qty(received)})`}
                          tone="danger"
                        />
                      )}
                      {missingLot && <StatusBadge label="Lot number required" tone="danger" />}
                      {missingExpiry && <StatusBadge label="Expiry date required" tone="danger" />}
                      {short && !invalidReject && (
                        <StatusBadge label={`Short by ${qty(due - received)}`} tone="warning" />
                      )}
                      {over && !invalidReject && (
                        <StatusBadge label={`Over-delivered by ${qty(received - due)}`} tone="purple" />
                      )}
                      {rej > 0 && !invalidReject && (
                        <StatusBadge label={`${qty(rej)} rejected to quarantine`} tone="danger" />
                      )}
                    </div>
                  )}
                </li>
              ),
            )}
          </ul>
        </Section>

        <Section title="Put-away and paperwork">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="put-away">Put-away location</Label>
              <Select
                items={locationLabels}
                value={locationId}
                onValueChange={(v) => setLocationId(v ?? "")}
              >
                <SelectTrigger id="put-away">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">
                Rejected units go to quarantine regardless of this setting.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="receipt-note">
                Discrepancy note {noteRequired && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                id="receipt-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did not match, and what you did about it."
                aria-invalid={noteMissing || undefined}
                className={cn(noteMissing && "border-destructive")}
              />
              {noteMissing && (
                <p className="text-caption text-destructive">
                  Required because this receipt does not match the order. The supplier will be sent
                  this note with the discrepancy claim.
                </p>
              )}
            </div>
          </div>
        </Section>
      </div>

      <div className="grid content-start gap-4">
        <Section title="Receipt summary" description="Check this before confirming.">
          <div className="grid gap-3">
            <StatTile label="Outstanding" value={qty(totalDue)} />
            <StatTile label="Counted" value={qty(totalReceived)} />
            <StatTile
              label="Rejected"
              value={qty(totalRejected)}
              tone={totalRejected > 0 ? "danger" : "neutral"}
              hint={totalRejected > 0 ? "Quarantined, not sellable" : undefined}
            />
            <StatTile
              label={`Into stock at ${destination}`}
              value={qty(totalAccepted)}
              tone="success"
              hint={`${money(acceptedValue)} of goods`}
            />
          </div>

          <div className="mt-4">
            {discrepancies.length === 0 && totalReceived > 0 ? (
              <StatusBadge label="Matches the order" tone="success" size="md" />
            ) : discrepancies.length > 0 ? (
              <StatusBadge
                label={`${plural(discrepancies.length, "discrepancy", "discrepancies")}`}
                tone="warning"
                size="md"
              />
            ) : (
              <StatusBadge label="Nothing counted yet" tone="neutral" size="md" />
            )}
          </div>
        </Section>

        {discrepancies.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-status-warning-border bg-status-warning-bg p-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-status-warning">
                This receipt will not close the order
              </p>
              <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
                Short lines stay outstanding and the order remains partially received. Rejected
                units are booked to quarantine and raise a purchase return against {supplier}, not
                a stock write-off.
              </p>
            </div>
          </div>
        )}

        <Button
          size="sm"
          className="h-8"
          disabled={!canConfirm}
          onClick={() =>
            toast.success(`${orderNumber} received`, {
              description: `${qty(totalAccepted)} units into stock at ${destination}${
                totalRejected > 0 ? `, ${qty(totalRejected)} quarantined` : ""
              }. Each line is written to the movement ledger.`,
            })
          }
        >
          <PackageCheck className="size-3.5" aria-hidden />
          Confirm receipt
        </Button>

        {blocking.length > 0 && (
          <p className="text-caption text-destructive">
            {plural(blocking.length, "line")} cannot be booked in yet — a tracked SKU needs its lot
            number or expiry date before it can be put away.
          </p>
        )}
      </div>
    </div>
  );
}
