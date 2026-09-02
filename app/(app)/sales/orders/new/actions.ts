"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { SalesOrderError, createSalesOrder } from "@/lib/domain/fulfilment";

/**
 * Placing a Sales Order (ticket 07). Per ADR-0005 this holds no logic: it
 * validates the payload with zod, resolves the Actor from the session, and
 * hands the fields to `createSalesOrder`. The permission check, the number
 * allocation, the Event and the writes all live in the domain function — as
 * does the decision that a new order is a `draft` and reserves nothing.
 */

const LineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  discountPct: z.number().min(0).max(100),
  taxPct: z.number().min(0).max(100),
});

const Schema = z.object({
  customerId: z.string().min(1),
  warehouseId: z.string().min(1),
  channel: z.enum(["web", "pos", "phone", "edi", "marketplace"]),
  promisedInDays: z.number().int().min(0).max(90),
  shipping: z.number().min(0),
  notes: z.string().trim().default(""),
  lines: z.array(LineSchema).min(1),
});

export type PlaceOrderResult =
  | { ok: true; id: string; number: string }
  | { ok: false; message: string };

export async function placeSalesOrder(raw: unknown): Promise<PlaceOrderResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Check the customer, the site and the lines and try again." };
  }

  const actor = await getCurrentUser();

  try {
    const order = await createSalesOrder(actor, parsed.data, getDb());
    revalidatePath("/sales/orders");
    revalidatePath(`/sales/orders/${order.id}`);
    return { ok: true, id: order.id, number: order.number };
  } catch (error) {
    if (error instanceof SalesOrderError) return { ok: false, message: error.message };
    throw error;
  }
}
