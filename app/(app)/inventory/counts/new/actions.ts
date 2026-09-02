"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { CountError, scheduleStockCount } from "@/lib/domain/counts";

/**
 * Scheduling a Stock Count (ticket 09). Per ADR-0005 this holds no logic: it
 * validates the scope with zod, resolves the Actor from the session, and hands
 * the fields to `scheduleStockCount`. The permission check, the number
 * allocation, the Event, and the rule that a scope with no holdings is refused
 * rather than scheduled empty all live in the domain function.
 */

const Schema = z.object({
  warehouseId: z.string().min(1),
  type: z.enum(["full", "cycle", "category", "location", "spot"]),
  zone: z.string().trim().nullable().default(null),
  categoryId: z.string().trim().nullable().default(null),
  limit: z.number().int().min(1).nullable().default(null),
  scheduledInDays: z.number().int().min(0).max(90),
  assignedTo: z.array(z.string().min(1)).min(1),
  scopeLabel: z.string().trim().min(1),
});

export type ScheduleCountResult =
  | { ok: true; id: string; number: string; lines: number }
  | { ok: false; message: string };

export async function scheduleCount(raw: unknown): Promise<ScheduleCountResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Check the scope and the counters and try again." };
  }

  const actor = await getCurrentUser();

  try {
    const count = await scheduleStockCount(actor, parsed.data, getDb());
    revalidatePath("/inventory/counts");
    revalidatePath(`/inventory/counts/${count.id}`);
    return { ok: true, id: count.id, number: count.number, lines: count.lines };
  } catch (error) {
    if (error instanceof CountError) return { ok: false, message: error.message };
    throw error;
  }
}
