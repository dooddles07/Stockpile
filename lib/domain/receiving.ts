/**
 * Goods receipt against a Purchase Order (ticket 12) — the first write flow
 * where two balances move in opposite directions for one action and a Document
 * advances its state as a consequence.
 *
 * On-hand rises through the choke point as a `purchase-receipt` Movement, one
 * per received line. Incoming is never written here: it is `sum(quantity -
 * fulfilled)` over the lines of open Purchase Orders (`documents.incomingByProduct`,
 * CONTEXT.md "Incoming"), so it falls purely because this function raised the
 * line's `fulfilled` and advanced the order out of the open set — not because
 * anything decremented an `incoming` field.
 *
 * Everything is one interactive transaction (`StockDb` lets `applyStockChange`
 * run on it — see `lib/domain/stock.ts`): the Purchase Order and its lines are
 * locked, each accepted line goes through the choke point, the line `fulfilled`
 * totals are raised, and the order's status is recomputed. A failure on any
 * line — a permission refusal, an impossible balance — rolls the whole receipt
 * back, so a half-booked delivery cannot exist (spec story 26).
 *
 * Over-receipt is permitted with the excess recorded: a line may end with
 * `fulfilled` above `quantity`, on-hand rises by the full accepted quantity,
 * and the order still closes. This matches the receiving screen, which shows an
 * over-delivery as an allowed discrepancy rather than blocking the confirm.
 *
 * Like `lib/domain/stock.ts` this imports no `server-only` code: the caller
 * passes the Drizzle handle (`getDb()` on the request path, an own `Pool` for
 * `receiving.checks.ts`). The permission matrix must already be hydrated.
 */

import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { applyStockChange, ensureStockHolding, type Actor } from "@/lib/domain/stock";
import { runAutomation } from "@/lib/domain/automation";
import type { POStatus } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

/**
 * The Purchase Order statuses a delivery can be booked against: the order has
 * been sent to the supplier (`ordered`) or is already part-way through arriving
 * (`partially-received`). `draft` / `submitted` / `approved` are not yet
 * committed to the supplier; `received` / `closed` / `cancelled` are settled.
 * `satisfies` keeps this honest against `POStatus` if the enum ever changes.
 */
export const RECEIVABLE_PO_STATUSES = [
  "ordered",
  "partially-received",
] as const satisfies readonly POStatus[];

export function isReceivable(status: POStatus): boolean {
  return (RECEIVABLE_PO_STATUSES as readonly POStatus[]).includes(status);
}

export type GoodsReceiptErrorCode = "forbidden" | "not-found" | "invalid" | "not-receivable";

export class GoodsReceiptError extends Error {
  constructor(
    message: string,
    readonly code: GoodsReceiptErrorCode,
  ) {
    super(message);
    this.name = "GoodsReceiptError";
  }
}

export interface GoodsReceiptLineInput {
  /** `OrderLine.id` — the dataset's own line id (`LN-001`), unique within the order. */
  lineId: string;
  /** Units physically accepted into stock on this line. Zero lines are skipped. */
  receivedQty: number;
  /** Where the units are put away. */
  locationId: string;
  /** Required for a batch-tracked product; null otherwise. */
  lotNumber?: string | null;
}

export interface GoodsReceiptInput {
  purchaseOrderId: string;
  lines: GoodsReceiptLineInput[];
  /** Free-text explanation, used as the Movement reason when a receipt does not
   *  match the order. Falls back to a reference to the order number. */
  note?: string;
}

export interface GoodsReceiptLineResult {
  lineId: string;
  sku: string;
  receivedQty: number;
  movementId: string;
  /** New on-hand at the put-away holding after this line. */
  onHand: number;
  /** New received-so-far total on the line. */
  fulfilled: number;
  ordered: number;
}

export interface GoodsReceiptResult {
  purchaseOrderId: string;
  number: string;
  status: POStatus;
  /** True when every line is now fully received and the order closed. */
  closed: boolean;
  lines: GoodsReceiptLineResult[];
  totalReceived: number;
}

/**
 * Book a delivery in against a Purchase Order. Returns the order's new status
 * and the per-line results. Throws `GoodsReceiptError` (nothing written) when
 * the Actor cannot receive, the order is missing or not in a receivable state,
 * or a line is not on the order; throws `StockChangeError` when a line's stock
 * change is itself impossible.
 */
export async function receiveGoods(
  actor: Actor,
  input: GoodsReceiptInput,
  db: Db,
): Promise<GoodsReceiptResult> {
  // ADR-0004: permission before anything else, so a caller reaching this
  // directly — automation, a REST layer, a check script — is refused exactly
  // as one coming through the hidden Receive tab would be. `applyStockChange`
  // re-checks the same permission per line; this earlier gate refuses a
  // forbidden Actor before any row is locked and covers a zero-line request.
  if (!can(actor.role, "receiving", "edit")) {
    throw new GoodsReceiptError(
      `Your role (${actor.role}) is not allowed to receive goods.`,
      "forbidden",
    );
  }

  const accepted = input.lines.filter((l) => l.receivedQty > 0);
  if (accepted.length === 0) {
    throw new GoodsReceiptError("Enter what arrived on at least one line.", "invalid");
  }
  if (accepted.some((l) => !Number.isInteger(l.receivedQty) || l.receivedQty < 0)) {
    throw new GoodsReceiptError("Received quantities must be whole numbers.", "invalid");
  }

  const eventSeqs: number[] = [];
  const result = await db.transaction(async (tx) => {
    const [po] = await tx
      .select()
      .from(schema.purchaseOrders)
      .where(eq(schema.purchaseOrders.id, input.purchaseOrderId))
      .for("update");
    if (!po) throw new GoodsReceiptError("Purchase order not found.", "not-found");
    if (!isReceivable(po.status)) {
      throw new GoodsReceiptError(
        `${po.number} is ${po.status} and cannot take a delivery.`,
        "not-receivable",
      );
    }

    const lineRows = await tx
      .select()
      .from(schema.purchaseOrderLines)
      .where(eq(schema.purchaseOrderLines.purchaseOrderId, po.id))
      .for("update")
      .orderBy(schema.purchaseOrderLines.seq);
    const linesById = new Map(lineRows.map((r) => [r.id, r]));

    const results: GoodsReceiptLineResult[] = [];
    for (const received of accepted) {
      const line = linesById.get(received.lineId);
      if (!line) {
        throw new GoodsReceiptError(
          `Line ${received.lineId} is not on ${po.number}.`,
          "invalid",
        );
      }
      const lotNumber = received.lotNumber?.trim() || null;

      await ensureStockHolding(tx, {
        productId: line.productId,
        warehouseId: po.warehouseId,
        locationId: received.locationId,
        lotNumber,
      });

      const change = await applyStockChange(
        actor,
        {
          productId: line.productId,
          warehouseId: po.warehouseId,
          locationId: received.locationId,
          lotNumber,
          movementType: "purchase-receipt",
          onHandDelta: received.receivedQty,
          reason: input.note?.trim() || `Goods receipt against ${po.number}`,
          permission: { module: "receiving", action: "edit" },
          ref: { type: "purchase-order", id: po.id, number: po.number },
        },
        tx,
      );
      eventSeqs.push(change.eventSeq);

      const fulfilled = line.fulfilled + received.receivedQty;
      await tx
        .update(schema.purchaseOrderLines)
        .set({ fulfilled })
        .where(eq(schema.purchaseOrderLines.seq, line.seq));
      linesById.set(line.id, { ...line, fulfilled });

      results.push({
        lineId: line.id,
        sku: line.sku,
        receivedQty: received.receivedQty,
        movementId: change.movementId,
        onHand: change.onHand,
        fulfilled,
        ordered: line.quantity,
      });
    }

    // The Document advances as a consequence of the receipt: fully received
    // when every line has met its ordered quantity (over-receipt counts),
    // otherwise partially received. Incoming falls out of this, not out of a
    // write to any balance.
    const allLines = [...linesById.values()];
    const fullyReceived = allLines.every((l) => l.fulfilled >= l.quantity);
    const status: POStatus = fullyReceived ? "received" : "partially-received";
    const receivedAt = fullyReceived ? new Date().toISOString() : po.receivedAt;

    if (status !== po.status || receivedAt !== po.receivedAt) {
      await tx
        .update(schema.purchaseOrders)
        .set({ status, receivedAt })
        .where(eq(schema.purchaseOrders.id, po.id));
    }

    return {
      purchaseOrderId: po.id,
      number: po.number,
      status,
      closed: fullyReceived,
      lines: results,
      totalReceived: results.reduce((s, r) => s + r.receivedQty, 0),
    };
  });

  // After commit: evaluate matching Automation Rules in the same request
  // (ADR-0008). Never throws; a failing rule is recorded, not propagated.
  await runAutomation(db, eventSeqs);
  return result;
}
