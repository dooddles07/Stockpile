"use client";

import * as React from "react";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";

import { processReturnAction, type ProcessReturnFormState } from "./actions";
import { Button } from "@/components/ui/button";

const INITIAL: ProcessReturnFormState = { status: "idle" };

/**
 * The "Process return" submit button, wired to `processReturnAction`. Shown on a
 * return's detail page while it is still in a processable state and the Actor's
 * Role can edit that kind of return — booking a customer return's goods back in,
 * or sending a supplier return's goods out, is the one write this screen makes.
 */
export function ProcessReturnButton({
  returnId,
  label,
  pendingLabel,
}: {
  returnId: string;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = React.useActionState(processReturnAction, INITIAL);

  const seen = React.useRef<ProcessReturnFormState>(INITIAL);
  React.useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.status === "success") toast.success(state.message);
    else if (state.status === "error") toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="intent" value="process" />
      <input type="hidden" name="returnId" value={returnId} />
      <Button type="submit" size="sm" className="h-8" disabled={pending}>
        <Undo2 className="size-3.5" aria-hidden />
        {pending ? pendingLabel : label}
      </Button>
    </form>
  );
}
