"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  attempt,
  createProduct,
  updateProduct,
  type SaveResult,
} from "@/lib/domain/reference";

/**
 * Reference-data write actions for Products (ticket 11). Per ADR-0005 the
 * action re-validates at the trust boundary and delegates; the permission
 * check and the row write live in the domain function.
 */

const Schema = z.object({
  id: z.string().min(1).optional(),
  sku: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[A-Z0-9-]+$/),
  name: z.string().trim().min(3),
  categoryId: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  supplierId: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  barcode: z.union([z.literal(""), z.string().regex(/^\d{13}$/)]),
  description: z.string().trim().max(500),
  unitCost: z.coerce.number().min(0),
  sellPrice: z.coerce.number().min(0),
  reorderPoint: z.coerce.number().int().min(0),
  reorderQty: z.coerce.number().int().min(1),
  leadTimeDays: z.coerce.number().int().min(0).max(365),
  batchTracked: z.coerce.boolean(),
  serialTracked: z.coerce.boolean(),
  hasExpiry: z.coerce.boolean(),
  shelfLifeDays: z.coerce.number().int().min(0),
});

export async function saveProduct(raw: unknown): Promise<SaveResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: "Check the highlighted fields and try again." };
  }

  const { id, ...input } = parsed.data;
  const actor = await getCurrentUser();
  const db = getDb();

  const result = await attempt(() =>
    id ? updateProduct(actor, id, input, db).then(() => id) : createProduct(actor, input, db),
  );

  if (result.ok) {
    revalidatePath("/inventory/products");
    revalidatePath(`/inventory/products/${input.sku}`);
  }
  return result;
}
