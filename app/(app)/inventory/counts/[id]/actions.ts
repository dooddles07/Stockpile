"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { completeStockCount, CountError } from "@/lib/domain/counts";
import { StockChangeError } from "@/lib/domain/stock";

/**
 * The Stock Count completion write path (ticket 15). Per ADR-0005 this file
 * holds no logic: it validates the sheet, resolves the Actor from the session,
 * and hands off to `completeStockCount`. The permission check, the state machine
 * and the choke-point writes all live below this layer.
 */

const LineSchema = z.object({
  lineId: z.string().min(1),
  counted: z.coerce.number().int().min(0),
});

const CompleteSchema = z.object({
  intent: z.literal("complete"),
  stockCountId: z.string().min(1),
  lines: z.preprocess((v) => {
    try {
      return JSON.parse(String(v));
    } catch {
      return null;
    }
  }, z.array(LineSchema).min(1)),
});

export type CountFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string; corrections: number };

export async function submitCountAction(
  _prev: CountFormState,
  formData: FormData,
): Promise<CountFormState> {
  const parsed = CompleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "That count could not be read." };
  }

  const actor = await getCurrentUser();

  try {
    const r = await completeStockCount(
      actor,
      { stockCountId: parsed.data.stockCountId, lines: parsed.data.lines },
      getDb(),
    );

    revalidatePath(`/inventory/counts/${parsed.data.stockCountId}`);
    revalidatePath("/inventory/counts");
    revalidatePath("/inventory/movements");
    revalidatePath("/inventory/stock-levels");

    return {
      status: "success",
      corrections: r.corrections,
      message:
        r.corrections === 0
          ? `${r.number} completed — every counted line matched, nothing posted.`
          : `${r.number} completed — ${r.corrections} correction${
              r.corrections === 1 ? "" : "s"
            } posted to the ledger.`,
    };
  } catch (error) {
    if (error instanceof CountError || error instanceof StockChangeError) {
      return { status: "error", message: error.message };
    }
    throw error;
  }
}
