"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  attempt,
  createSupplier,
  updateSupplier,
  type SaveResult,
} from "@/lib/domain/reference";

/**
 * Reference-data write actions for Suppliers (ticket 11). Per ADR-0005 the
 * action only re-validates at the trust boundary and delegates; the permission
 * check and the row write live in the domain function.
 */

const Schema = z.object({
  id: z.string().min(1).optional(),
  code: z.string().trim().min(3).max(12),
  name: z.string().trim().min(2),
  contactName: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7),
  addressLine: z.string().trim().min(4),
  city: z.string().trim().min(2),
  country: z.string().trim().min(1),
  paymentTerms: z.string().trim().min(1),
  currency: z.string().trim().min(1),
  leadTimeDays: z.coerce.number().int().min(1).max(365),
  categories: z.array(z.string().min(1)).min(1),
});

export async function saveSupplier(raw: unknown): Promise<SaveResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: "Check the highlighted fields and try again." };
  }

  const { id, ...input } = parsed.data;
  const actor = await getCurrentUser();
  const db = getDb();

  const result = await attempt(() =>
    id ? updateSupplier(actor, id, input, db).then(() => id) : createSupplier(actor, input, db),
  );

  if (result.ok) {
    revalidatePath("/purchasing/suppliers");
    if (id) revalidatePath(`/purchasing/suppliers/${id}`);
  }
  return result;
}
