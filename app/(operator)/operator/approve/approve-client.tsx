"use client";

import * as React from "react";
import { BadgeCheck, Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/states";
import { money, plural, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ApprovalItem {
  id: string;
  kind: string;
  kindLabel: string;
  number: string;
  title: string;
  subtitle: string;
  amount: number;
  requestedBy: string;
  createdAt: string;
  href: string;
}

/**
 * Approvals on a handheld.
 *
 * One decision at a time, on a card, with the amount at the size it deserves —
 * approving four figures of spend on a phone deserves more friction than a
 * checkbox in a list. A rejection asks for a reason, because "rejected" with no
 * note is the thing that generates the follow-up phone call.
 */
export function ApproveClient({ items }: { items: ApprovalItem[] }) {
  const [decided, setDecided] = React.useState<Record<string, "approved" | "rejected">>({});
  const [rejecting, setRejecting] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  const pending = items.filter((item) => !decided[item.id]);

  const approve = (item: ApprovalItem) => {
    setDecided((prev) => ({ ...prev, [item.id]: "approved" }));
    toast.success(`${item.number} approved`, { description: item.subtitle });
  };

  const reject = (item: ApprovalItem) => {
    setDecided((prev) => ({ ...prev, [item.id]: "rejected" }));
    toast.warning(`${item.number} rejected`, { description: reason.trim() || "No reason given." });
    setRejecting(null);
    setReason("");
  };

  if (pending.length === 0) {
    return (
      <EmptyState
        headingLevel={1}
        icon={BadgeCheck}
        title={items.length === 0 ? "Nothing waiting on you" : "Queue cleared"}
        description={
          items.length === 0
            ? "No purchase orders, transfers, adjustments or counts need your decision right now."
            : `You have decided all ${plural(items.length, "item")} in the queue.`
        }
        className="py-16"
      />
    );
  }

  return (
    <div className="grid gap-3 p-4">
      <h1 className="sr-only">Approvals</h1>
      <p className="text-[13px] text-muted-foreground">
        {plural(pending.length, "decision")} waiting, oldest first.
      </p>

      {pending.map((item) => (
        <article key={item.id} className="rounded-lg border bg-surface p-4">
          <p className="text-overline text-muted-foreground">{item.kindLabel}</p>
          <h2 className="mt-1 text-code text-[15px] font-semibold">{item.number}</h2>
          <p className="mt-1 text-[13px] leading-snug">{item.subtitle}</p>

          <p className="mt-3 tabular text-[24px] font-semibold leading-none">
            {money(Math.abs(item.amount))}
          </p>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            Raised by {item.requestedBy} · {relative(item.createdAt)}
          </p>

          {rejecting === item.id ? (
            <div className="mt-4 grid gap-2">
              <label htmlFor={`reason-${item.id}`} className="text-[13px] font-medium">
                Why is this rejected?
              </label>
              <Textarea
                id={`reason-${item.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Quantity is double what the site can hold."
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="h-11 flex-1"
                  onClick={() => reject(item)}
                >
                  Confirm rejection
                </Button>
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    setRejecting(null);
                    setReason("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <Button className={cn("h-12 flex-1 text-[15px]")} onClick={() => approve(item)}>
                <Check className="size-4" aria-hidden />
                Approve
              </Button>
              <Button
                variant="outline"
                className="h-12 flex-1 text-[15px]"
                onClick={() => {
                  setRejecting(item.id);
                  setReason("");
                }}
              >
                <X className="size-4" aria-hidden />
                Reject
              </Button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
