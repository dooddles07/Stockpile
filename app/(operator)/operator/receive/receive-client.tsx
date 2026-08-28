"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Check, PackageCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status/status-badge";
import { EmptyState } from "@/components/states";
import { dueLabel, plural, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ReceiptLine {
  id: string;
  sku: string;
  name: string;
  outstanding: number;
}

export interface Receipt {
  id: string;
  number: string;
  kind: "purchase" | "transfer";
  source: string;
  status: string;
  expectedAt: string;
  overdue: boolean;
  lines: ReceiptLine[];
}

/**
 * Receiving on a handheld.
 *
 * The default is "all of it arrived", because that is what happens most of the
 * time — the operator only touches a number when it is wrong. Short and over
 * receipts are both allowed and both called out before anything is posted,
 * since discovering a discrepancy after the pallet is put away is what makes
 * stock records drift.
 */
export function ReceiveClient({ receipts, siteCode }: { receipts: Receipt[]; siteCode: string }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const open = receipts.find((r) => r.id === openId) ?? null;

  if (open) {
    return <ReceiptForm receipt={open} onBack={() => setOpenId(null)} />;
  }

  if (receipts.length === 0) {
    return (
      <EmptyState
        headingLevel={1}
        icon={PackageCheck}
        title="Nothing due in"
        description={`No purchase orders or transfers are currently expected at ${siteCode}.`}
        className="py-16"
      />
    );
  }

  return (
    <div className="grid gap-2 p-4">
      <h1 className="sr-only">Receive deliveries</h1>
      <p className="text-[13px] text-muted-foreground">
        {plural(receipts.length, "delivery")} expected at {siteCode}, soonest first.
      </p>
      <ul className="grid gap-2">
        {receipts.map((receipt) => (
          <li key={receipt.id}>
            <button
              type="button"
              onClick={() => setOpenId(receipt.id)}
              className="flex w-full items-center gap-3 rounded-lg border bg-surface px-3 py-3 text-left transition-colors active:bg-surface-sunken"
            >
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="flex items-center gap-2">
                  <span className="text-code text-[14px] font-medium">{receipt.number}</span>
                  <StatusBadge status={receipt.status} />
                </span>
                <span className="truncate text-[12px] text-muted-foreground">{receipt.source}</span>
                <span
                  className={cn(
                    "text-[11px]",
                    receipt.overdue ? "font-medium text-status-danger" : "text-muted-foreground",
                  )}
                >
                  {plural(receipt.lines.length, "line")} ·{" "}
                  {qty(receipt.lines.reduce((s, l) => s + l.outstanding, 0))} units ·{" "}
                  {dueLabel(receipt.expectedAt)}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReceiptForm({ receipt, onBack }: { receipt: Receipt; onBack: () => void }) {
  const [counts, setCounts] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(receipt.lines.map((l) => [l.id, l.outstanding])),
  );
  const [posted, setPosted] = React.useState(false);

  const set = (id: string, value: number) =>
    setCounts((prev) => ({ ...prev, [id]: Math.max(0, value) }));

  const discrepancies = receipt.lines
    .map((line) => ({ line, received: counts[line.id] ?? 0 }))
    .filter(({ line, received }) => received !== line.outstanding);

  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const expected = receipt.lines.reduce((s, l) => s + l.outstanding, 0);

  const post = () => {
    setPosted(true);
    toast.success(`${receipt.number} received`, {
      description:
        discrepancies.length === 0
          ? `${qty(total)} units booked in, all lines complete.`
          : `${qty(total)} of ${qty(expected)} units booked in. ${plural(
              discrepancies.length,
              "line",
            )} flagged for review.`,
    });
  };

  if (posted) {
    return (
      <div className="grid gap-4 p-4">
        <EmptyState
          headingLevel={1}
          icon={Check}
          title={`${receipt.number} booked in`}
          description={
            discrepancies.length === 0
              ? `All ${qty(total)} units received in full. Stock is live.`
              : `${qty(total)} of ${qty(expected)} units received. The ${plural(
                  discrepancies.length,
                  "short line",
                  "short lines",
                )} stay open on the order.`
          }
          className="py-12"
          action={
            <Button size="sm" className="h-11 px-5" onClick={onBack}>
              Next delivery
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-4">
      <Button variant="ghost" size="sm" className="h-9 justify-self-start px-2" onClick={onBack}>
        <ArrowLeft className="size-4" aria-hidden />
        All deliveries
      </Button>

      <div className="rounded-lg border bg-surface p-4">
        <div className="flex items-center gap-2">
          <h1 className="text-code text-[16px] font-semibold">{receipt.number}</h1>
          <StatusBadge status={receipt.status} />
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">{receipt.source}</p>
        <p
          className={cn(
            "mt-0.5 text-[12px]",
            receipt.overdue ? "font-medium text-status-danger" : "text-muted-foreground",
          )}
        >
          Expected {dueLabel(receipt.expectedAt)}
        </p>
      </div>

      <ul className="grid gap-2">
        {receipt.lines.map((line) => {
          const received = counts[line.id] ?? 0;
          const diff = received - line.outstanding;
          return (
            <li key={line.id} className="rounded-lg border bg-surface p-3">
              <p className="text-[14px] font-medium leading-snug">{line.name}</p>
              <p className="mt-0.5 text-code text-[12px] text-muted-foreground">{line.sku}</p>

              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11 shrink-0 text-lg"
                  aria-label={`One fewer ${line.sku}`}
                  onClick={() => set(line.id, received - 1)}
                  disabled={received === 0}
                >
                  −
                </Button>
                <div className="min-w-0 flex-1">
                  <label htmlFor={`qty-${line.id}`} className="sr-only">
                    Quantity received for {line.sku}
                  </label>
                  <Input
                    id={`qty-${line.id}`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={received}
                    onChange={(e) => set(line.id, Number(e.target.value))}
                    className="h-11 text-center text-[17px] tabular"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11 shrink-0 text-lg"
                  aria-label={`One more ${line.sku}`}
                  onClick={() => set(line.id, received + 1)}
                >
                  +
                </Button>
              </div>

              <p
                className={cn(
                  "mt-2 text-[12px]",
                  diff === 0 ? "text-muted-foreground" : "font-medium text-status-warning",
                )}
              >
                {diff === 0
                  ? `Expected ${qty(line.outstanding)} — matches`
                  : diff < 0
                    ? `${qty(-diff)} short of the ${qty(line.outstanding)} expected`
                    : `${qty(diff)} more than the ${qty(line.outstanding)} expected`}
              </p>
            </li>
          );
        })}
      </ul>

      {discrepancies.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2.5 text-[13px] text-status-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            {plural(discrepancies.length, "line does", "lines do")} not match what was expected.
            Posting anyway is fine — the difference is recorded against the order for purchasing to
            chase.
          </p>
        </div>
      )}

      <div className="sticky bottom-20 grid gap-2">
        <Button size="lg" className="h-12 w-full text-[15px]" onClick={post}>
          <Check className="size-4" aria-hidden />
          Receive {qty(total)} units
        </Button>
      </div>
    </div>
  );
}
