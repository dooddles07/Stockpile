"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  advanceSalesOrder,
  cancelSalesOrder,
  confirmSalesOrder,
  shipSalesOrder,
  SalesOrderError,
} from "@/lib/domain/fulfilment";
import { StockChangeError } from "@/lib/domain/stock";

/**
 * The Sales Order fulfilment actions (ticket 13). Per ADR-0005 this file holds
 * no logic: it validates the form, resolves the Actor from the session, and
 * hands off to one of the `lib/domain/fulfilment.ts` functions. The permission
 * check, the state machine and the choke-point writes all live below here.
 *
 * One action covers the whole flow, keyed by `intent`, because the Fulfil tab
 * shows exactly one button at a time — the one for the order's current state.
 */

const INTENTS = ["confirm", "reserve", "pick", "pack", "ship", "cancel"] as const;

const FormSchema = z.object({
  salesOrderId: z.string().min(1),
  intent: z.enum(INTENTS),
  carrier: z.string().trim().optional(),
});

export type FulfilmentFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string; soStatus: string };

const ADVANCE_TO = { reserve: "reserved", pick: "picking", pack: "packing" } as const;

export async function advanceSalesOrderAction(
  _prev: FulfilmentFormState,
  formData: FormData,
): Promise<FulfilmentFormState> {
  const parsed = FormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "That fulfilment action could not be read." };
  }
  const { salesOrderId, intent, carrier } = parsed.data;
  const actor = await getCurrentUser();
  const db = getDb();

  try {
    let message: string;
    let soStatus: string;

    if (intent === "confirm") {
      const r = await confirmSalesOrder(actor, { salesOrderId }, db);
      soStatus = r.status;
      message = `${r.number} confirmed — ${r.reservedUnits} units reserved.`;
    } else if (intent === "cancel") {
      const r = await cancelSalesOrder(actor, { salesOrderId }, db);
      soStatus = r.status;
      message = `${r.number} cancelled — ${r.releasedUnits} units released.`;
    } else if (intent === "ship") {
      const r = await shipSalesOrder(actor, { salesOrderId, carrier: carrier || null }, db);
      soStatus = r.status;
      message = `${r.number} shipped — ${r.totalShipped} units left stock.`;
    } else {
      const r = await advanceSalesOrder(actor, { salesOrderId, to: ADVANCE_TO[intent] }, db);
      soStatus = r.status;
      message = `${r.number} moved to ${r.status}.`;
    }

    revalidatePath(`/sales/orders/${salesOrderId}`);
    revalidatePath("/sales/orders");
    revalidatePath("/warehousing/picking");
    revalidatePath("/warehousing/packing");
    revalidatePath("/inventory/movements");
    revalidatePath("/inventory/stock-levels");

    return { status: "success", message, soStatus };
  } catch (error) {
    if (error instanceof SalesOrderError || error instanceof StockChangeError) {
      return { status: "error", message: error.message };
    }
    throw error;
  }
}
