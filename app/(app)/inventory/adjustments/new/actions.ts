"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { ADJUSTMENT_REASONS, recordAdjustment } from "@/lib/domain/adjustments";
import { StockChangeError } from "@/lib/domain/stock";

/**
 * The first server action in Stockpile. Per ADR-0005 it holds no business
 * logic: it validates the form input with zod, resolves the Actor from the
 * session, and hands the validated fields straight to `recordAdjustment`. The
 * reason/direction rules and the permission check all live below this layer. A
 * future REST caller is a second thin wrapper over the same domain function.
 */

const FormSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  locationId: z.string().min(1),
  lotNumber: z
    .string()
    .trim()
    .transform((v) => v || null)
    .nullable()
    .default(null),
  reason: z.enum(ADJUSTMENT_REASONS),
  direction: z.enum(["add", "remove"]),
  quantity: z.coerce.number().int().positive(),
  note: z.string().trim().default(""),
});

export type AdjustmentFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string; movementId: string; onHand: number; damaged: number };

export async function submitAdjustment(
  _prev: AdjustmentFormState,
  formData: FormData,
): Promise<AdjustmentFormState> {
  const parsed = FormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Check the highlighted fields and try again." };
  }

  const actor = await getCurrentUser();

  try {
    const result = await recordAdjustment(actor, parsed.data, getDb());

    // Every screen under (app) is force-dynamic, but the movement ledger and the
    // stock reads are React-cached per request; drop them so the next
    // navigation shows the change that was just made.
    revalidatePath("/inventory/movements");
    revalidatePath("/inventory/adjustments");
    revalidatePath("/inventory/stock-levels");

    return {
      status: "success",
      message: `On-hand is now ${result.onHand}, damaged ${result.damaged}.`,
      movementId: result.movementId,
      onHand: result.onHand,
      damaged: result.damaged,
    };
  } catch (error) {
    if (error instanceof StockChangeError) {
      return { status: "error", message: error.message };
    }
    throw error;
  }
}
