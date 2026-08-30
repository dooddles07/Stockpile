"use client";

import * as React from "react";
import { PackageCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { submitTransferAction, type TransferFormState } from "./actions";
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
import { Section } from "@/components/record/field-grid";
import { StatusBadge } from "@/components/status/status-badge";
import { qty } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ReceivableLine {
  id: string;
  sku: string;
  name: string;
  shipped: number;
  alreadyReceived: number;
}

const INITIAL: TransferFormState = { status: "idle" };

/**
 * Receiving a transfer at its destination.
 *
 * Defaults to the outstanding quantity, but the whole point of this screen is
 * the case where the number on the pallet does not match the manifest — so a
 * short, an over-receipt and damage all have to be recordable, and each one is
 * called out before the operator confirms. The confirm submits to
 * `submitTransferAction`, which raises on-hand at the destination through the
 * choke point and clears the in-transit balance.
 */
export function ReceivePanel({
  transferId,
  transferNumber,
  destination,
  lines,
  locations,
}: {
  transferId: string;
  transferNumber: string;
  destination: string;
  lines: ReceivableLine[];
  locations: { id: string; code: string }[];
}) {
  const [state, formAction, pending] = React.useActionState(submitTransferAction, INITIAL);

  const outstanding = React.useMemo(
    () =>
      Object.fromEntries(
        lines.map((l) => [l.id, Math.max(0, l.shipped - l.alreadyReceived)] as const),
      ),
    [lines],
  );

  const [counts, setCounts] = React.useState<Record<string, number>>(outstanding);
  const [damaged, setDamaged] = React.useState<Record<string, number>>({});
  const [locationId, setLocationId] = React.useState(locations[0]?.id ?? "");
  const [note, setNote] = React.useState("");

  const locationLabels = React.useMemo(
    () => Object.fromEntries(locations.map((l) => [l.id, l.code])),
    [locations],
  );

  const resolved = lines.map((line) => {
    const due = outstanding[line.id];
    const counted = counts[line.id] ?? 0;
    const dmg = damaged[line.id] ?? 0;
    return {
      line,
      due,
      counted,
      damaged: dmg,
      good: Math.max(0, counted - dmg),
      short: counted < due,
      over: counted > due,
      invalid: dmg > counted,
    };
  });

  const totalCounted = resolved.reduce((s, r) => s + r.counted, 0);
  const totalDue = resolved.reduce((s, r) => s + r.due, 0);
  const totalDamaged = resolved.reduce((s, r) => s + r.damaged, 0);
  const discrepancies = resolved.filter((r) => r.short || r.over || r.damaged > 0);
  const invalid = resolved.filter((r) => r.invalid);
  const fullyReceived = totalCounted >= totalDue && discrepancies.length === 0;
  const noteRequired = discrepancies.length > 0;
  const noteMissing = noteRequired && note.trim().length === 0;

  // One entry per counted line: the units arriving and how many of them are
  // damaged. The domain caps each at what is still in transit for that line.
  const payload = JSON.stringify(
    resolved
      .filter((r) => r.counted > 0)
      .map((r) => ({ lineId: r.line.id, receivedQty: r.counted, damagedQty: r.damaged })),
  );

  const seen = React.useRef<TransferFormState>(INITIAL);
  React.useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.status === "success") {
      toast.success(`${transferNumber} received`, { description: state.message });
    } else if (state.status === "error") {
      toast.error(`${transferNumber} not received`, { description: state.message });
    }
  }, [state, transferNumber]);

  return (
    <form action={formAction} className="grid gap-4 lg:grid-cols-3">
      <input type="hidden" name="intent" value="receive" />
      <input type="hidden" name="transferId" value={transferId} />
      <input type="hidden" name="locationId" value={locationId} />
      <input type="hidden" name="note" value={note} />
      <input type="hidden" name="lines" value={payload} />

      <div className="grid content-start gap-4 lg:col-span-2">
        <Section
          title="Count what arrived"
          description="Quantities default to what is still outstanding. Change them to match the pallet in front of you."
          contentClassName="p-0"
        >
          <ul className="divide-y">
            {resolved.map(({ line, due, counted, damaged: dmg, good, short, over, invalid: bad }) => (
              <li key={line.id} className="grid gap-3 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[13px] font-medium">{line.name}</span>
                    <span className="text-code text-[11px] text-muted-foreground">
                      {line.sku} · {qty(line.shipped)} despatched
                      {line.alreadyReceived > 0 && ` · ${qty(line.alreadyReceived)} already received`}
                    </span>
                  </span>

                  <div className="flex flex-wrap items-end gap-3">
                    <div className="grid gap-1.5">
                      <Label
                        htmlFor={`count-${line.id}`}
                        className="text-caption text-muted-foreground"
                      >
                        Received
                      </Label>
                      <Input
                        id={`count-${line.id}`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={counted}
                        onChange={(e) =>
                          setCounts((c) => ({
                            ...c,
                            [line.id]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className={cn(
                          "h-8 w-24 text-right tabular",
                          (short || over) && "border-status-warning",
                          bad && "border-destructive",
                        )}
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <Label
                        htmlFor={`damaged-${line.id}`}
                        className="text-caption text-muted-foreground"
                      >
                        Damaged
                      </Label>
                      <Input
                        id={`damaged-${line.id}`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={dmg}
                        onChange={(e) =>
                          setDamaged((d) => ({
                            ...d,
                            [line.id]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className={cn("h-8 w-24 text-right tabular", bad && "border-destructive")}
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <span className="text-caption text-muted-foreground">Sellable</span>
                      <output className="flex h-8 w-24 items-center justify-end rounded-md border bg-surface-sunken px-3 text-[13px] font-semibold tabular">
                        {qty(good)}
                      </output>
                    </div>
                  </div>
                </div>

                {(short || over || dmg > 0 || bad) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {bad && (
                      <StatusBadge
                        label={`Damaged (${qty(dmg)}) exceeds received (${qty(counted)})`}
                        tone="danger"
                      />
                    )}
                    {short && !bad && (
                      <StatusBadge label={`Short by ${qty(due - counted)}`} tone="warning" />
                    )}
                    {over && !bad && (
                      <StatusBadge label={`Over by ${qty(counted - due)}`} tone="purple" />
                    )}
                    {dmg > 0 && !bad && (
                      <StatusBadge label={`${qty(dmg)} damaged, held back`} tone="danger" />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Where it is going" description="The location these units are being put away to.">
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
                Damaged units are booked to the damaged balance at this location.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="receive-note">
                Discrepancy note {noteRequired && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                id="receive-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did not match, and what you did about it."
                aria-invalid={noteMissing || undefined}
                className={cn(noteMissing && "border-destructive")}
              />
              {noteMissing && (
                <p className="text-caption text-destructive">
                  Required because this receipt does not match the manifest.
                </p>
              )}
            </div>
          </div>
        </Section>
      </div>

      <div className="grid content-start gap-4">
        <Section title="Receipt summary" description="Check this before confirming.">
          <dl className="grid gap-2 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Outstanding</dt>
              <dd className="tabular font-medium" data-numeric>
                {qty(totalDue)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Counted</dt>
              <dd className="tabular font-medium" data-numeric>
                {qty(totalCounted)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Damaged</dt>
              <dd
                className={cn("tabular font-medium", totalDamaged > 0 && "text-status-danger")}
                data-numeric
              >
                {qty(totalDamaged)}
              </dd>
            </div>
            <div className="mt-1 flex justify-between gap-4 border-t pt-2 text-[15px] font-semibold">
              <dt>Into stock at {destination}</dt>
              <dd className="tabular" data-numeric>
                {qty(totalCounted - totalDamaged)}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            {fullyReceived ? (
              <StatusBadge label="Matches the manifest" tone="success" size="md" />
            ) : (
              <StatusBadge
                label={`${discrepancies.length} discrepanc${discrepancies.length === 1 ? "y" : "ies"}`}
                tone="warning"
                size="md"
              />
            )}
          </div>
        </Section>

        {discrepancies.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-status-warning-border bg-status-warning-bg p-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-status-warning">
                This receipt will not close the transfer cleanly
              </p>
              <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
                Short lines stay outstanding and the transfer remains partially received. Damaged
                units are booked to the damaged balance, not to sellable stock, and raise a
                discrepancy for the source site to answer.
              </p>
            </div>
          </div>
        )}

        <Button
          type="submit"
          size="sm"
          className="h-8"
          disabled={pending || totalCounted === 0 || invalid.length > 0 || noteMissing}
        >
          <PackageCheck className="size-3.5" aria-hidden />
          {pending ? "Confirming…" : "Confirm receipt"}
        </Button>

        {state.status === "error" && (
          <p className="text-caption text-destructive" role="alert">
            {state.message}
          </p>
        )}

        {state.status === "success" && (
          <Section title="Booked in" description={state.message}>
            <div className="grid gap-2">
              <StatusBadge status={state.transferStatus} size="md" />
              <ul className="grid gap-1 text-caption text-muted-foreground">
                {state.lines.map((l) => (
                  <li key={l.sku} className="text-code">
                    {l.sku}: +{qty(l.qty)}
                    {typeof l.onHand === "number" && ` → ${qty(l.onHand)} on hand`}
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        )}
      </div>
    </form>
  );
}
