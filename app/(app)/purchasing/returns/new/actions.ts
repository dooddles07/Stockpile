"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { ReturnError, raiseReturn } from "@/lib/domain/returns";
import type { ReturnKind } from "@/lib/types";

/**
 * Raising a Return in either direction (ticket 10). Per ADR-0005 this holds no
 * logic: it validates the payload with zod, resolves the Actor from the
 * session, and hands the fields to `raiseReturn`. The permission check (keyed
 * by the Return's kind), the number allocation, the Event, and the rule that a
 * line cannot ask back more than its source Document moved all live in the
 * domain function.
 *
 * One action covers both screens — `components/record/return-form.tsx` is
 * shared by the sales and purchase return pages, the same way the `[id]`
 * processing action is.
 */

const LineSchema = z.object({
  lineId: z.string().min(1),
  quantity: z.number().int().min(1),
  condition: z.enum(["sellable", "damaged", "defective", "expired"]),
  restock: z.boolean(),
});

const Schema = z.object({
  kind: z.enum(["sales", "purchase"]),
  sourceOrderId: z.string().min(1),
  reason: z.string().trim().min(1),
  note: z.string().trim().default(""),
  lines: z.array(LineSchema).min(1),
});

export type RaiseReturnActionResult =
  | { ok: true; id: string; number: string; kind: ReturnKind }
  | { ok: false; message: string };

export async function raiseReturnAction(raw: unknown): Promise<RaiseReturnActionResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Check the source document and the lines and try again." };
  }

  const actor = await getCurrentUser();

  try {
    const r = await raiseReturn(actor, parsed.data, getDb());
    const base = r.kind === "purchase" ? "/purchasing/returns" : "/sales/returns";
    revalidatePath(base);
    revalidatePath(`${base}/${r.id}`);
    return { ok: true, id: r.id, number: r.number, kind: r.kind };
  } catch (error) {
    if (error instanceof ReturnError) return { ok: false, message: error.message };
    throw error;
  }
}
