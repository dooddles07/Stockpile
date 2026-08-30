"use client";

import * as React from "react";
import { Truck } from "lucide-react";
import { toast } from "sonner";

import { submitTransferAction, type TransferFormState } from "./actions";
import { Button } from "@/components/ui/button";

const INITIAL: TransferFormState = { status: "idle" };

/**
 * Despatch an approved transfer. `approved -> in-transit`: stock leaves the
 * source and the quantity becomes in transit. One button, shown in the record
 * header only for the approved state — the state machine lives in the domain.
 */
export function DispatchButton({ transferId }: { transferId: string }) {
  const [state, formAction, pending] = React.useActionState(submitTransferAction, INITIAL);

  const seen = React.useRef<TransferFormState>(INITIAL);
  React.useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.status === "success") toast.success(state.message);
    else if (state.status === "error") toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="intent" value="dispatch" />
      <input type="hidden" name="transferId" value={transferId} />
      <Button type="submit" size="sm" className="h-8" disabled={pending}>
        <Truck className="size-3.5" aria-hidden />
        {pending ? "Despatching…" : "Despatch"}
      </Button>
    </form>
  );
}
