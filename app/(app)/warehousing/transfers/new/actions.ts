"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { TransferError, createTransfer } from "@/lib/domain/transfers";

/**
 * Raising a Transfer (ticket 08). Per ADR-0005 this holds no logic: it
 * validates the payload with zod, resolves the Actor from the session, and
 * hands the fields to `createTransfer`. The permission check, the number
 * allocation, the Event and the writes all live in the domain function — as do
 * the rules that the two sites must differ and that every line's product must
 * be held at the source.
 */

const LineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1),
});

const Schema = z.object({
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  reason: z.string().trim().min(1),
  notes: z.string().trim().default(""),
  carrier: z.string().trim().nullable().default(null),
  expectedInDays: z.number().int().min(1).max(60),
  lines: z.array(LineSchema).min(1),
});

export type RaiseTransferResult =
  | { ok: true; id: string; number: string }
  | { ok: false; message: string };

export async function raiseTransfer(raw: unknown): Promise<RaiseTransferResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Check the two sites and the lines and try again." };
  }

  const actor = await getCurrentUser();

  try {
    const transfer = await createTransfer(actor, parsed.data, getDb());
    revalidatePath("/warehousing/transfers");
    revalidatePath(`/warehousing/transfers/${transfer.id}`);
    return { ok: true, id: transfer.id, number: transfer.number };
  } catch (error) {
    if (error instanceof TransferError) return { ok: false, message: error.message };
    throw error;
  }
}
