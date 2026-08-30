"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  attempt,
  createCustomer,
  updateCustomer,
  type SaveResult,
} from "@/lib/domain/reference";

/**
 * Reference-data write actions for Customers (ticket 11). Per ADR-0005 the
 * action re-validates at the trust boundary and delegates; the permission
 * check and the row write live in the domain function.
 */

const Schema = z.object({
  id: z.string().min(1).optional(),
  code: z.string().trim().min(3).max(12),
  name: z.string().trim().min(2),
  type: z.enum(["retail", "wholesale", "online", "government"]),
  contactName: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7),
  city: z.string().trim().min(2),
  country: z.string().trim().min(1),
  paymentTerms: z.string().trim().min(1),
  creditLimit: z.coerce.number().min(0),
});

export async function saveCustomer(raw: unknown): Promise<SaveResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: "Check the highlighted fields and try again." };
  }

  const { id, ...input } = parsed.data;
  const actor = await getCurrentUser();
  const db = getDb();

  const result = await attempt(() =>
    id ? updateCustomer(actor, id, input, db).then(() => id) : createCustomer(actor, input, db),
  );

  if (result.ok) {
    revalidatePath("/sales/customers");
    if (id) revalidatePath(`/sales/customers/${id}`);
  }
  return result;
}
