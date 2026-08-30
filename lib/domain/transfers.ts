/**
 * Transfer between Warehouses (ticket 14) — the only Document with two ends, and
 * the only flow where one logical operation touches more than one Stock Row.
 *
 *  - `dispatchTransfer` moves an `approved` transfer `-> in-transit`. Stock
 *    leaves the source: one or more `transfer-out` Movements per line through the
 *    choke point, lowering on-hand at the source warehouse. The quantity is now
 *    *in transit* — but nothing writes `stock_rows.in_transit`. In transit is
 *    `sum(shipped - received)` over the lines of open Transfers
 *    (`documents.inTransitByProduct`, CONTEXT.md "In Transit"), so it rises
 *    purely because this raised each line's `shipped` and moved the Document into
 *    the open set. Lowering on-hand and recording the despatch commit together
 *    or not at all: stock that left the source but was never recorded as in
 *    transit has vanished from the system.
 *
 *  - `receiveTransfer` moves an `in-transit` transfer `-> partially-received` or
 *    `-> received`. Stock arrives at the destination: one `transfer-in` Movement
 *    per line through the choke point, raising on-hand there. In transit falls
 *    because each line's `received` rises toward its `shipped`; when nothing is
 *    still in flight the Document leaves the open set and the transfer is
 *    `received`.
 *
 * Stock in transit belongs to neither end's on-hand: `dispatchTransfer` has
 * already removed it from the source and `receiveTransfer` has not yet added it
 * to the destination, so the gap is real for as long as the transfer is open.
 *
 * ADR-0006 — consistent lock order. The choke point takes one row lock per
 * Stock Row it touches, so a multi-line despatch takes several, and every flow
 * that locks more than one row must acquire them in the same order or two
 * concurrent transfers between the same pair of Warehouses can deadlock (A locks
 * P1 then P2 while B locks P2 then P1). `dispatchTransfer` plans every draw
 * across every line first, then sorts the draws by ascending `stock_rows.seq`
 * before calling the choke point — the same key `shipSalesOrder` draws in. A
 * despatch therefore locks Stock Rows low-seq-first regardless of line order,
 * and cannot deadlock against another despatch doing the same.
 *
 * Like `lib/domain/stock.ts` this imports no `server-only` code: the caller
 * passes the Drizzle handle (`getDb()` on the request path, an own `Pool` for
 * `transfers.checks.ts`). The permission matrix must already be hydrated.
 */

import { and, eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { applyStockChange, ensureStockHolding, type Actor } from "@/lib/domain/stock";
import type { TransferStatus } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

/** Both ends of a transfer are gated on the same access (ADR-0004, in the
 *  domain — the Receive tab's render gate is only a rendering gate). */
const TRANSFER_PERMISSION = { module: "transfers", action: "edit" } as const;

/**
 * Transfer statuses that still hold stock in transit — despatched from the
 * source and not yet fully booked in at the destination. `documents.ts` imports
 * this for `inTransitByProduct`; the in-transit projection sums
 * `shipped - received` over the lines of Transfers in one of these states.
 */
export const OPEN_TRANSFER_STATUSES = [
  "in-transit",
  "partially-received",
] as const satisfies readonly TransferStatus[];

export type TransferErrorCode =
  | "forbidden"
  | "not-found"
  | "invalid"
  | "wrong-state"
  | "insufficient-stock";

export class TransferError extends Error {
  constructor(
    message: string,
    readonly code: TransferErrorCode,
  ) {
    super(message);
    this.name = "TransferError";
  }
}

function assertCanEdit(actor: Actor): void {
  if (!can(actor.role, TRANSFER_PERMISSION.module, TRANSFER_PERMISSION.action)) {
    throw new TransferError(
      `Your role (${actor.role}) is not allowed to despatch or receive transfers.`,
      "forbidden",
    );
  }
}

export interface DispatchTransferLineResult {
  lineId: string;
  sku: string;
  shippedQty: number;
  /** One or more `transfer-out` Movement ids — a line can draw from several holdings. */
  movementIds: string[];
}

export interface DispatchTransferResult {
  transferId: string;
  number: string;
  status: TransferStatus;
  lines: DispatchTransferLineResult[];
  totalShipped: number;
}

/**
 * Despatch an approved Transfer: `approved -> in-transit`. Each line's
 * outstanding quantity (`quantity - shipped`) leaves the source as one or more
 * `transfer-out` Movements through the choke point, drawn from the product's
 * holdings in the source warehouse oldest-first. On failure — a permission
 * refusal, a line that cannot be covered, a choke-point rejection — the whole
 * despatch rolls back, so stock cannot leave the source without being recorded
 * in transit.
 */
export async function dispatchTransfer(
  actor: Actor,
  input: { transferId: string; carrier?: string | null; trackingNumber?: string | null },
  db: Db,
): Promise<DispatchTransferResult> {
  assertCanEdit(actor);

  return db.transaction(async (tx) => {
    const [transfer] = await tx
      .select()
      .from(schema.transfers)
      .where(eq(schema.transfers.id, input.transferId))
      .for("update");
    if (!transfer) throw new TransferError("Transfer not found.", "not-found");
    if (transfer.status !== "approved") {
      throw new TransferError(
        `${transfer.number} is ${transfer.status}; only an approved transfer can be despatched.`,
        "wrong-state",
      );
    }

    const lines = await tx
      .select()
      .from(schema.transferLines)
      .where(eq(schema.transferLines.transferId, transfer.id))
      .for("update")
      .orderBy(schema.transferLines.seq);
    if (lines.length === 0) {
      throw new TransferError(`${transfer.number} has no lines to despatch.`, "invalid");
    }

    // Plan every draw across every line first. `line.fromLocationId` records
    // where the picker pulled from, but stock may sit across several holdings —
    // draw oldest-first, the same way a shipment does.
    const draws: {
      rowSeq: number;
      lineSeq: number;
      productId: string;
      locationId: string;
      lotNumber: string | null;
      qty: number;
    }[] = [];

    for (const line of lines) {
      const outstanding = line.quantity - line.shipped;
      if (outstanding <= 0) continue;

      const holdings = await tx
        .select({
          seq: schema.stockRows.seq,
          locationId: schema.stockRows.locationId,
          lotNumber: schema.stockRows.lotNumber,
          onHand: schema.stockRows.onHand,
        })
        .from(schema.stockRows)
        .where(
          and(
            eq(schema.stockRows.productId, line.productId),
            eq(schema.stockRows.warehouseId, transfer.fromWarehouseId),
          ),
        )
        .orderBy(schema.stockRows.seq);

      let remaining = outstanding;
      for (const h of holdings) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Math.max(0, h.onHand));
        if (take <= 0) continue;
        draws.push({
          rowSeq: h.seq,
          lineSeq: line.seq,
          productId: line.productId,
          locationId: h.locationId,
          lotNumber: h.lotNumber,
          qty: take,
        });
        remaining -= take;
      }
      if (remaining > 0) {
        throw new TransferError(
          `${line.sku}: ${outstanding} to despatch but only ${outstanding - remaining} on hand at the source warehouse.`,
          "insufficient-stock",
        );
      }
    }

    // ADR-0006: acquire the per-Stock-Row locks in ascending `stock_rows.seq`
    // order — the one consistent order every multi-row flow uses — so two
    // concurrent despatches between the same pair of Warehouses cannot deadlock.
    draws.sort((a, b) => a.rowSeq - b.rowSeq);

    const reason = `Despatch of ${transfer.number}`;
    const shippedByLine = new Map<number, string[]>();
    for (const draw of draws) {
      const change = await applyStockChange(
        actor,
        {
          productId: draw.productId,
          warehouseId: transfer.fromWarehouseId,
          locationId: draw.locationId,
          lotNumber: draw.lotNumber,
          movementType: "transfer-out",
          onHandDelta: -draw.qty,
          reason,
          permission: TRANSFER_PERMISSION,
          ref: { type: "transfer", id: transfer.id, number: transfer.number },
        },
        tx,
      );
      const seen = shippedByLine.get(draw.lineSeq) ?? [];
      seen.push(change.movementId);
      shippedByLine.set(draw.lineSeq, seen);
    }

    const results: DispatchTransferLineResult[] = [];
    for (const line of lines) {
      const movementIds = shippedByLine.get(line.seq) ?? [];
      const outstanding = Math.max(0, line.quantity - line.shipped);
      const shippedQty = movementIds.length > 0 ? outstanding : 0;
      if (shippedQty > 0) {
        await tx
          .update(schema.transferLines)
          .set({ shipped: line.shipped + shippedQty })
          .where(eq(schema.transferLines.seq, line.seq));
      }
      results.push({ lineId: line.id, sku: line.sku, shippedQty, movementIds });
    }

    await tx
      .update(schema.transfers)
      .set({
        status: "in-transit",
        shippedAt: new Date().toISOString(),
        carrier: input.carrier?.trim() || transfer.carrier,
        trackingNumber: input.trackingNumber?.trim() || transfer.trackingNumber,
      })
      .where(eq(schema.transfers.id, transfer.id));

    return {
      transferId: transfer.id,
      number: transfer.number,
      status: "in-transit" as TransferStatus,
      lines: results,
      totalShipped: results.reduce((s, r) => s + r.shippedQty, 0),
    };
  });
}

export interface ReceiveTransferLineInput {
  /** `TransferLine.id` (`TL-001`) — unique within its transfer. */
  lineId: string;
  /** Units arriving into stock on this line. Zero lines are skipped. */
  receivedQty: number;
  /** Of `receivedQty`, how many are damaged — booked to the damaged balance, not on-hand. */
  damagedQty?: number;
}

export interface ReceiveTransferInput {
  transferId: string;
  /** The put-away location at the destination warehouse for every received line. */
  locationId: string;
  lines: ReceiveTransferLineInput[];
  /** Free-text explanation, used as the Movement reason. Falls back to the transfer number. */
  note?: string;
}

export interface ReceiveTransferLineResult {
  lineId: string;
  sku: string;
  receivedQty: number;
  movementId: string;
  /** New on-hand at the put-away holding after this line. */
  onHand: number;
  /** New received-so-far total on the line. */
  received: number;
  shipped: number;
}

export interface ReceiveTransferResult {
  transferId: string;
  number: string;
  status: TransferStatus;
  /** True when every line is now fully received and the transfer closed. */
  closed: boolean;
  lines: ReceiveTransferLineResult[];
  totalReceived: number;
}

/**
 * Book a Transfer in at its destination. Each line's received quantity raises
 * on-hand at the destination as one `transfer-in` Movement through the choke
 * point (its damaged portion goes to the damaged balance in the same Movement).
 * The line's `received` rises, so the in-transit projection falls; when nothing
 * is still in flight the transfer becomes `received`. A failure on any line
 * rolls the whole receipt back.
 *
 * A line cannot be received beyond what was despatched for it — receiving more
 * than left the source is physically impossible and would drive the in-transit
 * projection negative — so such a receipt is rejected and nothing changes.
 */
export async function receiveTransfer(
  actor: Actor,
  input: ReceiveTransferInput,
  db: Db,
): Promise<ReceiveTransferResult> {
  assertCanEdit(actor);

  if (!input.locationId) {
    throw new TransferError("A put-away location is required.", "invalid");
  }
  const accepted = input.lines.filter((l) => l.receivedQty > 0);
  if (accepted.length === 0) {
    throw new TransferError("Enter what arrived on at least one line.", "invalid");
  }
  for (const l of accepted) {
    const damaged = l.damagedQty ?? 0;
    if (!Number.isInteger(l.receivedQty) || l.receivedQty < 0 || !Number.isInteger(damaged) || damaged < 0) {
      throw new TransferError("Received and damaged quantities must be whole numbers.", "invalid");
    }
    if (damaged > l.receivedQty) {
      throw new TransferError("Damaged cannot exceed the quantity received on a line.", "invalid");
    }
  }

  return db.transaction(async (tx) => {
    const [transfer] = await tx
      .select()
      .from(schema.transfers)
      .where(eq(schema.transfers.id, input.transferId))
      .for("update");
    if (!transfer) throw new TransferError("Transfer not found.", "not-found");
    if (!(OPEN_TRANSFER_STATUSES as readonly TransferStatus[]).includes(transfer.status)) {
      throw new TransferError(
        `${transfer.number} is ${transfer.status}; only a transfer in transit can be received.`,
        "wrong-state",
      );
    }

    const lineRows = await tx
      .select()
      .from(schema.transferLines)
      .where(eq(schema.transferLines.transferId, transfer.id))
      .for("update")
      .orderBy(schema.transferLines.seq);
    const linesById = new Map(lineRows.map((r) => [r.id, r]));

    // ADR-0006: one put-away location for the whole receipt, so the Stock Rows
    // locked differ only by product — take them in a consistent order (ascending
    // productId) so this cannot deadlock against another receipt.
    const ordered = [...accepted].sort((a, b) => {
      const pa = linesById.get(a.lineId)?.productId ?? "";
      const pb = linesById.get(b.lineId)?.productId ?? "";
      return pa < pb ? -1 : pa > pb ? 1 : 0;
    });

    const reason = input.note?.trim() || `Receipt of ${transfer.number}`;
    const results: ReceiveTransferLineResult[] = [];

    for (const r of ordered) {
      const line = linesById.get(r.lineId);
      if (!line) {
        throw new TransferError(`Line ${r.lineId} is not on ${transfer.number}.`, "invalid");
      }
      const outstanding = line.shipped - line.received;
      if (r.receivedQty > outstanding) {
        throw new TransferError(
          `${line.sku}: ${r.receivedQty} to receive but only ${Math.max(0, outstanding)} still in transit.`,
          "insufficient-stock",
        );
      }
      const damagedQty = r.damagedQty ?? 0;
      const goodQty = r.receivedQty - damagedQty;

      await ensureStockHolding(tx, {
        productId: line.productId,
        warehouseId: transfer.toWarehouseId,
        locationId: input.locationId,
        lotNumber: null,
      });

      const change = await applyStockChange(
        actor,
        {
          productId: line.productId,
          warehouseId: transfer.toWarehouseId,
          locationId: input.locationId,
          lotNumber: null,
          movementType: "transfer-in",
          onHandDelta: goodQty,
          damagedDelta: damagedQty,
          reason,
          permission: TRANSFER_PERMISSION,
          ref: { type: "transfer", id: transfer.id, number: transfer.number },
        },
        tx,
      );

      const received = line.received + r.receivedQty;
      await tx
        .update(schema.transferLines)
        .set({ received, toLocationId: input.locationId })
        .where(eq(schema.transferLines.seq, line.seq));
      linesById.set(line.id, { ...line, received, toLocationId: input.locationId });

      results.push({
        lineId: line.id,
        sku: line.sku,
        receivedQty: r.receivedQty,
        movementId: change.movementId,
        onHand: change.onHand,
        received,
        shipped: line.shipped,
      });
    }

    // The Document advances as a consequence: fully received when no line has
    // anything still in transit (`received >= shipped`), otherwise partially
    // received. In transit falls out of this, not out of a write to any balance.
    const allLines = [...linesById.values()];
    const fullyReceived = allLines.every((l) => l.received >= l.shipped);
    const status: TransferStatus = fullyReceived ? "received" : "partially-received";
    const receivedAt = fullyReceived ? new Date().toISOString() : transfer.receivedAt;

    if (status !== transfer.status || receivedAt !== transfer.receivedAt) {
      await tx
        .update(schema.transfers)
        .set({ status, receivedAt })
        .where(eq(schema.transfers.id, transfer.id));
    }

    return {
      transferId: transfer.id,
      number: transfer.number,
      status,
      closed: fullyReceived,
      lines: results,
      totalReceived: results.reduce((s, r) => s + r.receivedQty, 0),
    };
  });
}
