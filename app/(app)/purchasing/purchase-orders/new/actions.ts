"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PurchaseOrderError, createPurchaseOrder } from "@/lib/domain/purchasing";

/**
 * Raising a Purchase Order (ticket 06). Per ADR-0005 this holds no logic: it
 * validates the payload with zod, resolves the Actor from the session, and
 * hands the fields to `createPurchaseOrder`. The permission check, the number
 * allocation, the Event and the writes all live in the domain function.
 */

const LineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  discountPct: z.number().min(0).max(100),
  taxPct: z.number().min(0).max(100),
});

const Schema = z.object({
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  shipping: z.number().min(0),
  notes: z.string().trim().default(""),
  lines: z.array(LineSchema).min(1),
});

export type RaiseOrderResult =
  | { ok: true; id: string; number: string }
  | { ok: false; message: string };

export async function raisePurchaseOrder(raw: unknown): Promise<RaiseOrderResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Check the supplier, destination and lines and try again." };
  }

  const actor = await getCurrentUser();

  try {
    const order = await createPurchaseOrder(actor, parsed.data, getDb());
    revalidatePath("/purchasing/purchase-orders");
    revalidatePath(`/purchasing/purchase-orders/${order.id}`);
    return { ok: true, id: order.id, number: order.number };
  } catch (error) {
    if (error instanceof PurchaseOrderError) return { ok: false, message: error.message };
    throw error;
  }
}
