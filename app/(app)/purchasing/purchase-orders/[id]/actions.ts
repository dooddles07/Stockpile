"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { GoodsReceiptError, receiveGoods } from "@/lib/domain/receiving";
import { StockChangeError } from "@/lib/domain/stock";

/**
 * Booking a delivery in against a Purchase Order (ticket 12). Per ADR-0005 this
 * holds no logic: it validates the form, resolves the Actor from the session,
 * and hands the fields to `receiveGoods`. The permission check, the state
 * machine and the choke-point writes all live below this layer.
 */

const LineSchema = z.object({
  lineId: z.string().min(1),
  receivedQty: z.coerce.number().int().min(0),
  locationId: z.string().min(1),
  lotNumber: z
    .string()
    .trim()
    .transform((v) => v || null)
    .nullable()
    .default(null),
});

const FormSchema = z.object({
  purchaseOrderId: z.string().min(1),
  note: z.string().trim().default(""),
  lines: z.preprocess((v) => {
    try {
      return JSON.parse(String(v));
    } catch {
      return null;
    }
  }, z.array(LineSchema).min(1)),
});

export type GoodsReceiptFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      message: string;
      poStatus: string;
      closed: boolean;
      totalReceived: number;
      lines: { sku: string; receivedQty: number; onHand: number; fulfilled: number; ordered: number }[];
    };

export async function submitGoodsReceipt(
  _prev: GoodsReceiptFormState,
  formData: FormData,
): Promise<GoodsReceiptFormState> {
  const parsed = FormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Check the quantities and try again." };
  }

  const actor = await getCurrentUser();

  try {
    const result = await receiveGoods(
      actor,
      {
        purchaseOrderId: parsed.data.purchaseOrderId,
        note: parsed.data.note || undefined,
        lines: parsed.data.lines,
      },
      getDb(),
    );

    revalidatePath(`/purchasing/purchase-orders/${result.purchaseOrderId}`);
    revalidatePath("/purchasing/purchase-orders");
    revalidatePath("/purchasing/goods-received");
    revalidatePath("/inventory/movements");
    revalidatePath("/inventory/stock-levels");

    return {
      status: "success",
      message: result.closed
        ? `${result.number} is fully received.`
        : `${result.number} is partially received — ${result.totalReceived} units booked in.`,
      poStatus: result.status,
      closed: result.closed,
      totalReceived: result.totalReceived,
      lines: result.lines.map((l) => ({
        sku: l.sku,
        receivedQty: l.receivedQty,
        onHand: l.onHand,
        fulfilled: l.fulfilled,
        ordered: l.ordered,
      })),
    };
  } catch (error) {
    if (error instanceof GoodsReceiptError || error instanceof StockChangeError) {
      return { status: "error", message: error.message };
    }
    throw error;
  }
}
