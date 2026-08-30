"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { processReturn, ReturnError } from "@/lib/domain/returns";
import { StockChangeError } from "@/lib/domain/stock";

/**
 * The Return processing write path (ticket 16). Per ADR-0005 this file holds no
 * logic: it validates the form, resolves the Actor from the session, and hands
 * off to `processReturn`. The permission check (keyed by the Return's kind), the
 * state machine and the choke-point writes all live below this layer.
 *
 * One action covers both directions — the detail page shows a single "Process"
 * button and `processReturn` branches on the Return it loads.
 */

const FormSchema = z.object({
  intent: z.literal("process"),
  returnId: z.string().min(1),
});

export type ProcessReturnFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string; returnStatus: string };

export async function processReturnAction(
  _prev: ProcessReturnFormState,
  formData: FormData,
): Promise<ProcessReturnFormState> {
  const parsed = FormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "That return action could not be read." };
  }

  const actor = await getCurrentUser();

  try {
    const r = await processReturn(actor, { returnId: parsed.data.returnId }, getDb());

    revalidatePath(`/purchasing/returns/${parsed.data.returnId}`);
    revalidatePath(`/sales/returns/${parsed.data.returnId}`);
    revalidatePath("/purchasing/returns");
    revalidatePath("/sales/returns");
    revalidatePath(`/${r.kind === "purchase" ? "purchasing/purchase-orders" : "sales/orders"}/${r.sourceOrderId}`);
    revalidatePath("/inventory/movements");
    revalidatePath("/inventory/stock-levels");

    const moved =
      r.kind === "sales"
        ? `${r.totalUnits} units booked back in`
        : `${r.totalUnits} units sent back to the supplier`;
    return {
      status: "success",
      returnStatus: r.status,
      message: `${r.number} processed — ${moved}.`,
    };
  } catch (error) {
    if (error instanceof ReturnError || error instanceof StockChangeError) {
      return { status: "error", message: error.message };
    }
    throw error;
  }
}
