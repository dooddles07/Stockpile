"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  attempt,
  createLocation,
  updateLocation,
  type SaveResult,
} from "@/lib/domain/reference";

/**
 * Reference-data write actions for Locations (ticket 11). Per ADR-0005 the
 * action re-validates at the trust boundary, derives the shelf-label code from
 * its parts, and delegates; the permission check and the row write live in the
 * domain function.
 */

const Schema = z.object({
  id: z.string().min(1).optional(),
  warehouseId: z.string().trim().min(1),
  zone: z.string().trim().min(1).max(4),
  aisle: z.string().trim().min(1).max(4),
  rack: z.string().trim().min(1).max(4),
  bin: z.string().trim().min(1).max(4),
  type: z.enum(["bin", "shelf", "floor", "staging", "quarantine"]),
  capacityUnits: z.coerce.number().int().min(1).max(1_000_000),
  restricted: z.coerce.boolean(),
});

export async function saveLocation(raw: unknown): Promise<SaveResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: "Check the highlighted fields and try again." };
  }

  const { id, zone, aisle, rack, bin, ...rest } = parsed.data;
  const code = [zone, aisle, rack, bin].map((p) => p.toUpperCase()).join("-");
  const input = { ...rest, zone, aisle, rack, bin, code };

  const actor = await getCurrentUser();
  const db = getDb();

  const result = await attempt(() =>
    id ? updateLocation(actor, id, input, db).then(() => id) : createLocation(actor, input, db),
  );

  if (result.ok) {
    revalidatePath("/warehousing/locations");
    revalidatePath("/warehousing/warehouses");
  }
  return result;
}
