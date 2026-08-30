/**
 * Adjustment and damage — the first write flow (ticket 10).
 *
 * This is the pattern every later write flow copies: a domain function takes the
 * Actor, maps a user-facing intent onto a stock change, and calls the choke
 * point (`applyStockChange`) once. It holds no transaction, no lock and no
 * projection write of its own — that all lives in the choke point, so ADR-0006's
 * "the lock is taken in exactly one place" stays true.
 *
 * Like `lib/domain/stock.ts` this imports no `server-only` code: the caller
 * passes the Drizzle handle. The server action passes `getDb()`; the below-UI
 * check in `adjustments.checks.ts` passes its own pool.
 *
 * An Adjustment always carries a reason (CONTEXT.md: "a discrepancy that is
 * explained rather than silently corrected"). The reason `"damaged"` is the one
 * that moves quantity out of on-hand and into the damaged balance rather than
 * simply removing it; every other reason is a straight on-hand correction.
 */

import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import * as schema from "@/lib/db/schema";
import {
  applyStockChange,
  type Actor,
  type StockChangeResult,
} from "@/lib/domain/stock";
import type { AdjustmentReason } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

/**
 * The eight Adjustment reasons as a runtime list, for the server action's zod
 * schema and the form's picker. `satisfies` plus the guard below fail `tsc` if
 * `AdjustmentReason` gains a member this list is missing.
 */
export const ADJUSTMENT_REASONS = [
  "damaged",
  "lost",
  "found",
  "expired",
  "count-error",
  "manual-correction",
  "internal-use",
  "other",
] as const satisfies readonly AdjustmentReason[];

type _ReasonsExhaustive =
  Exclude<AdjustmentReason, (typeof ADJUSTMENT_REASONS)[number]> extends never
    ? true
    : ["ADJUSTMENT_REASONS is missing", Exclude<AdjustmentReason, (typeof ADJUSTMENT_REASONS)[number]>];
const _reasonsExhaustive: _ReasonsExhaustive = true;
void _reasonsExhaustive;

export interface RecordAdjustmentInput {
  productId: string;
  warehouseId: string;
  locationId: string;
  /** Null targets the un-lotted holding; a string targets that lot. */
  lotNumber?: string | null;
  reason: AdjustmentReason;
  /** How many units. Always positive; `direction` carries the sign. */
  quantity: number;
  /** Whether the units are added to or removed from on-hand. Ignored for
   *  `"damaged"` — damage always removes on-hand and adds to damaged. */
  direction: "add" | "remove";
  /** Free-text explanation. Falls back to the reason code when blank. */
  note?: string;
}

/**
 * Record one Adjustment (or damage write-off) for the Actor. Returns the choke
 * point's result — the new on-hand and damaged balances and the ledger row id.
 * Throws `StockChangeError` (nothing written) when the Actor is not permitted,
 * the holding is not a single row, or the change would drive a balance below
 * zero.
 *
 * This is the one place the reason-and-direction intent becomes a stock change:
 * `"damaged"` is the reason that moves quantity out of on-hand and into the
 * damaged balance; every other reason is a straight on-hand correction whose
 * sign is the caller's `direction`.
 */
export async function recordAdjustment(
  actor: Actor,
  input: RecordAdjustmentInput,
  db: Db,
): Promise<StockChangeResult> {
  const magnitude = Math.abs(input.quantity);
  const isDamage = input.reason === "damaged";
  const onHandDelta = isDamage || input.direction === "remove" ? -magnitude : magnitude;

  return applyStockChange(
    actor,
    {
      productId: input.productId,
      warehouseId: input.warehouseId,
      locationId: input.locationId,
      lotNumber: input.lotNumber ?? null,
      movementType: isDamage ? "damage" : "adjustment",
      onHandDelta,
      damagedDelta: isDamage ? magnitude : 0,
      reason: input.note?.trim() || input.reason,
      permission: { module: "adjustments", action: "create" },
    },
    db,
  );
}
