"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { decideOnApproval } from "./approval-actions";
import type { DocumentType } from "@/lib/domain/approvals";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/format";

export interface DecisionItem {
  id: string;
  type: DocumentType;
  number: string;
  title: string;
  subtitle: string;
  amount: number;
}

/**
 * The decide controls for one Approvals queue group the Role can act on. Each
 * row approves in one click; rejecting asks for a reason first, because
 * "rejected" with no note is what generates the follow-up phone call. A decided
 * Document leaves its pending status, so the server revalidation drops it from
 * the queue on the next render.
 */
export function DecisionList({ items }: { items: DecisionItem[] }) {
  return (
    <div className="divide-y">
      {items.map((item) => (
        <DecisionRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function DecisionRow({ item }: { item: DecisionItem }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const decide = (decision: "approve" | "reject") => {
    startTransition(async () => {
      const result = await decideOnApproval({
        type: item.type,
        id: item.id,
        decision,
        reason: decision === "reject" ? reason.trim() : undefined,
      });
      if (result.ok) {
        toast.success(result.message);
        setRejecting(false);
        setReason("");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="grid gap-2 px-4 py-2.5">
      <div className="flex items-start gap-2.5">
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-[13px] font-medium leading-snug">{item.title}</span>
          <span className="truncate text-caption text-muted-foreground">{item.subtitle}</span>
        </span>
        <span className="shrink-0 text-[13px] font-medium tabular" data-numeric>
          {money(Math.abs(item.amount))}
        </span>
      </div>

      {rejecting ? (
        <div className="grid gap-2">
          <label htmlFor={`reason-${item.id}`} className="text-caption font-medium">
            Why is {item.number} rejected?
          </label>
          <Textarea
            id={`reason-${item.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. Quantity is double what the site can hold."
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="h-8"
              disabled={pending || !reason.trim()}
              onClick={() => decide("reject")}
            >
              Confirm rejection
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={pending}
              onClick={() => {
                setRejecting(false);
                setReason("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" className="h-8" disabled={pending} onClick={() => decide("approve")}>
            <Check className="size-3.5" aria-hidden />
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={pending}
            onClick={() => setRejecting(true)}
          >
            <X className="size-3.5" aria-hidden />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
