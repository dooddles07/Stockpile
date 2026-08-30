"use client";

import * as React from "react";
import { toast } from "sonner";

import { advanceSalesOrderAction, type FulfilmentFormState } from "./actions";
import { Button } from "@/components/ui/button";

const INITIAL: FulfilmentFormState = { status: "idle" };

/**
 * One fulfilment step as a submit button wired to `advanceSalesOrderAction`.
 * Used on the Fulfil tab (reserve / pick / pack / ship) and in the order header
 * (confirm / cancel) — the Fulfil tab only ever shows the single button for the
 * order's current state, so a button per intent is all this needs to be.
 */
export function FulfilmentActionButton({
  salesOrderId,
  intent,
  children,
  pendingLabel,
  carrier,
  disabled,
  variant,
  size = "sm",
  className,
}: {
  salesOrderId: string;
  intent: "confirm" | "reserve" | "pick" | "pack" | "ship" | "cancel";
  children: React.ReactNode;
  pendingLabel: string;
  /** Sent with `intent="ship"` so the shipment records the chosen carrier. */
  carrier?: string;
  disabled?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const [state, formAction, pending] = React.useActionState(advanceSalesOrderAction, INITIAL);

  const seen = React.useRef<FulfilmentFormState>(INITIAL);
  React.useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.status === "success") toast.success(state.message);
    else if (state.status === "error") toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="salesOrderId" value={salesOrderId} />
      <input type="hidden" name="intent" value={intent} />
      {intent === "ship" && <input type="hidden" name="carrier" value={carrier ?? ""} />}
      <Button
        type="submit"
        size={size}
        variant={variant}
        className={className}
        disabled={disabled || pending}
      >
        {pending ? pendingLabel : children}
      </Button>
    </form>
  );
}
