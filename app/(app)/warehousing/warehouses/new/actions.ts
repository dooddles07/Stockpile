"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  attempt,
  createWarehouse,
  updateWarehouse,
  type SaveResult,
} from "@/lib/domain/reference";

/**
 * Reference-data write actions for Warehouses (ticket 11). Per ADR-0005 the
 * action re-validates at the trust boundary and delegates; the permission
 * check and the row write live in the domain function.
 */

const Schema = z.object({
  id: z.string().min(1).optional(),
  code: z.string().trim().min(2).max(8),
  name: z.string().trim().min(3),
  type: z.enum(["distribution", "retail", "fulfillment", "cold"]),
  status: z.enum(["operational", "maintenance", "closed"]),
  addressLine: z.string().trim().min(4),
  city: z.string().trim().min(2),
  region: z.string().trim().min(2),
  country: z.string().trim().min(2),
  managerId: z.string().trim().min(1),
  capacityPallets: z.coerce.number().int().min(1).max(200_000),
  timezone: z.string().trim().min(1),
});

export async function saveWarehouse(raw: unknown): Promise<SaveResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: "Check the highlighted fields and try again." };
  }

  const { id, ...input } = parsed.data;
  const actor = await getCurrentUser();
  const db = getDb();

  const result = await attempt(() =>
    id ? updateWarehouse(actor, id, input, db).then(() => id) : createWarehouse(actor, input, db),
  );

  if (result.ok) {
    revalidatePath("/warehousing/warehouses");
    revalidatePath("/warehousing/locations");
    if (id) revalidatePath(`/warehousing/warehouses/${id}`);
  }
  return result;
}
