/**
 * Transfer between Warehouses (ticket 14), and raising one in the first place
 * (ticket 08) — the only Document with two ends, and the only flow where one
 * logical operation touches more than one Stock Row.
 *
 *  - `createTransfer` writes a new transfer in `draft`, with its lines and an
 *    Event. A `draft` is not in the open set, and every line starts with
 *    `shipped = 0`, so creation puts nothing in transit and moves no stock: it
 *    records a plan, and despatching is what enacts it.
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
 *    still in transit the Document leaves the open set and the transfer is
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

import { and, eq, inArray, isNull } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { allocateDocumentNumber } from "@/lib/db/numbers";
import { applyStockChange, ensureStockHolding, type Actor } from "@/lib/domain/stock";
import { runAutomation } from "@/lib/domain/automation";
import { newId } from "@/lib/domain/reference";
import type { ApprovalEvent, TransferStatus } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

/** Both ends of a transfer are gated on the same access (ADR-0004, in the
 *  domain — the Receive tab's render gate is only a rendering gate). */
const TRANSFER_PERMISSION = { module: "transfers", action: "edit" } as const;

/** Raising a transfer is a `create` on the same module (ADR-0004) — a different
 *  permission from despatching or receiving one. */
const CREATE_PERMISSION = { module: "transfers", action: "create" } as const;

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

export interface CreateTransferLineInput {
  productId: string;
  quantity: number;
}

export interface CreateTransferInput {
  fromWarehouseId: string;
  toWarehouseId: string;
  /** Why the stock is moving; `transfers.reason` is NOT NULL. */
  reason: string;
  notes: string;
  carrier: string | null;
  /** Days from today the stock is expected to land; `expected_at` is NOT NULL. */
  expectedInDays: number;
  lines: CreateTransferLineInput[];
}

export interface CreateTransferResult {
  id: string;
  number: string;
  /** Units the transfer plans to move — `sum(quantity)`. */
  units: number;
}

/**
 * Raise a Transfer between two Warehouses (ticket 08). Returns the new
 * transfer's id and number. Throws `TransferError` — and writes nothing at all
 * — when the Actor's Role forbids creating transfers, the transfer has no
 * lines, the two ends are the same Warehouse, or a line's product is not held
 * at the source.
 *
 * Creation moves no stock and creates no in-transit quantity. In transit is
 * `sum(shipped - received)` over the lines of Transfers in
 * `OPEN_TRANSFER_STATUSES`, and a `draft` is in neither that set nor any stock
 * balance: every line starts at `shipped = 0`, so the projection cannot move.
 * A draft is a plan; `dispatchTransfer` above is what enacts it, once the
 * transfer has been approved.
 *
 * The two ends must differ — a transfer from a site to itself has no despatch
 * and no receipt to make — and that is enforced here rather than only in the
 * form, which is a rendering gate.
 *
 * Each line's product must already be held at the source, and its lowest-seq
 * non-empty holding becomes the line's `from_location_id`: the pick location
 * the despatch is planned against. It is a plan rather than a commitment, since
 * `dispatchTransfer` re-plans the draw across every holding oldest-first, so
 * stock that has moved location by then still despatches. That is also why the
 * rule is "held at the source" rather than "coverable from the source": a draft
 * plans a move that has to be coverable when it is despatched, not when it is
 * raised, and stock arrives at the source in between. What it rules out is a
 * product the source has no holding for at all — which is both a line the
 * source could never pick and a line with no `from_location_id` to record, and
 * that column is NOT NULL.
 *
 * The number, the Event, the transfer and its lines commit together or not at
 * all, so a creation that fails partway leaves nothing behind — except its
 * burned number, which is correct for a Document number (`lib/db/numbers.ts`).
 *
 * The Warehouses are not looked up: both columns carry a foreign key, so an
 * unknown one is the database's rejection to make, and it rolls the whole
 * transaction back like any other failure.
 */
export async function createTransfer(
  actor: Actor,
  input: CreateTransferInput,
  db: Db,
): Promise<CreateTransferResult> {
  if (!can(actor.role, CREATE_PERMISSION.module, CREATE_PERMISSION.action)) {
    throw new TransferError(
      `Your role (${actor.role}) is not allowed to raise transfers.`,
      "forbidden",
    );
  }
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new TransferError(
      "A transfer needs two different sites: stock cannot move to where it already is.",
      "invalid",
    );
  }
  if (input.lines.length === 0) {
    throw new TransferError("A transfer needs at least one line.", "invalid");
  }
  if (input.lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) {
    throw new TransferError("Every line needs a whole quantity of at least one.", "invalid");
  }

  const created = await db.transaction(async (tx) => {
    const productIds = input.lines.map((l) => l.productId);

    // The line's SKU and name are copied from the catalogue, not from the
    // client: a Document records what was moved at the time it was raised.
    const productRows = await tx
      .select({ id: schema.products.id, sku: schema.products.sku, name: schema.products.name })
      .from(schema.products)
      .where(inArray(schema.products.id, productIds));
    const products = new Map(productRows.map((p) => [p.id, p]));

    // One query for every line's source holding. The lowest-seq holding that
    // actually has something in it wins — that is the one `dispatchTransfer`
    // draws from first, since it skips empty holdings. An empty holding is
    // still a holding for the purpose of the rule below, so it is kept as a
    // fallback: a product the source holds but has none of right now can be
    // planned for, and the despatch is where it has to be coverable.
    const holdings = await tx
      .select({
        productId: schema.stockRows.productId,
        locationId: schema.stockRows.locationId,
        onHand: schema.stockRows.onHand,
      })
      .from(schema.stockRows)
      .where(
        and(
          inArray(schema.stockRows.productId, productIds),
          eq(schema.stockRows.warehouseId, input.fromWarehouseId),
        ),
      )
      .orderBy(schema.stockRows.seq);
    const sourceLocation = new Map<string, string>();
    const emptySourceLocation = new Map<string, string>();
    for (const holding of holdings) {
      const target = holding.onHand > 0 ? sourceLocation : emptySourceLocation;
      if (!target.has(holding.productId)) target.set(holding.productId, holding.locationId);
    }

    const lines = input.lines.map((line, i) => {
      const product = products.get(line.productId);
      if (!product) throw new TransferError(`Unknown product on line ${i + 1}.`, "not-found");
      const fromLocationId =
        sourceLocation.get(line.productId) ?? emptySourceLocation.get(line.productId);
      if (!fromLocationId) {
        throw new TransferError(
          `${product.sku} is not held at the source site, so it cannot be transferred out of it.`,
          "invalid",
        );
      }

      return {
        id: `TL-${String(i + 1).padStart(3, "0")}`,
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity: line.quantity,
        // A draft has despatched and received nothing, and in transit is
        // derived from these two — so it starts at zero and stays there until
        // the transfer is despatched.
        shipped: 0,
        received: 0,
        fromLocationId,
        toLocationId: null,
      };
    });

    const number = await allocateDocumentNumber(tx, "transfer");
    const id = newId("TR");
    const createdAt = new Date();
    const approvals: ApprovalEvent[] = [
      { id: newId("APV"), ts: createdAt.toISOString(), userId: actor.id, action: "created" },
    ];

    // The Event first — it is the source of truth; the rows below are its
    // projection and commit with it (ADR-0002, ADR-0003).
    const [event] = await tx
      .insert(schema.events)
      .values({
        type: "transfer-created",
        actorId: actor.id,
        payload: {
          transferId: id,
          number,
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          status: "draft",
          lines: lines.map((l) => ({ sku: l.sku, quantity: l.quantity })),
        },
      })
      .returning({ seq: schema.events.seq });

    await tx.insert(schema.transfers).values({
      id,
      number,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      status: "draft",
      createdAt: createdAt.toISOString(),
      approvedAt: null,
      shippedAt: null,
      expectedAt: new Date(
        createdAt.getTime() + Math.max(1, input.expectedInDays) * 24 * 60 * 60 * 1000,
      ).toISOString(),
      receivedAt: null,
      requestedBy: actor.id,
      approvedBy: null,
      approvals,
      carrier: input.carrier?.trim() || null,
      trackingNumber: null,
      reason: input.reason,
      notes: input.notes,
    });

    await tx
      .insert(schema.transferLines)
      .values(lines.map((line) => ({ ...line, transferId: id })));

    return {
      id,
      number,
      units: lines.reduce((s, l) => s + l.quantity, 0),
      eventSeq: event.seq,
    };
  });

  // After commit: evaluate matching Automation Rules in the same request
  // (ADR-0008), as every other flow that appends an Event does. Never throws.
  await runAutomation(db, [created.eventSeq]);
  return { id: created.id, number: created.number, units: created.units };
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

  const eventSeqs: number[] = [];
  const result = await db.transaction(async (tx) => {
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
      eventSeqs.push(change.eventSeq);
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

  // After commit: evaluate matching Automation Rules in the same request
  // (ADR-0008). Never throws; a failing rule is recorded, not propagated.
  await runAutomation(db, eventSeqs);
  return result;
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
 * is still in transit the transfer becomes `received`. A failure on any line
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

  const eventSeqs: number[] = [];
  const result = await db.transaction(async (tx) => {
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

    // Every received line is put away at the one location; make sure each holding
    // exists so the choke point has a row to lock.
    for (const r of accepted) {
      const line = linesById.get(r.lineId);
      if (!line) {
        throw new TransferError(`Line ${r.lineId} is not on ${transfer.number}.`, "invalid");
      }
      await ensureStockHolding(tx, {
        productId: line.productId,
        warehouseId: transfer.toWarehouseId,
        locationId: input.locationId,
        lotNumber: null,
      });
    }

    // ADR-0006: acquire the per-Stock-Row locks in ascending `stock_rows.seq`
    // order — the same key `dispatchTransfer` uses — so a receipt cannot
    // deadlock against another concurrent receipt.
    const seqByProduct = new Map(
      (
        await tx
          .select({ productId: schema.stockRows.productId, seq: schema.stockRows.seq })
          .from(schema.stockRows)
          .where(
            and(
              eq(schema.stockRows.warehouseId, transfer.toWarehouseId),
              eq(schema.stockRows.locationId, input.locationId),
              isNull(schema.stockRows.lotNumber),
            ),
          )
      ).map((row) => [row.productId, row.seq] as const),
    );
    const ordered = [...accepted].sort(
      (a, b) =>
        (seqByProduct.get(linesById.get(a.lineId)!.productId) ?? 0) -
        (seqByProduct.get(linesById.get(b.lineId)!.productId) ?? 0),
    );

    const reason = input.note?.trim() || `Receipt of ${transfer.number}`;
    const results: ReceiveTransferLineResult[] = [];

    for (const r of ordered) {
      const line = linesById.get(r.lineId)!;
      const outstanding = line.shipped - line.received;
      if (r.receivedQty > outstanding) {
        throw new TransferError(
          `${line.sku}: ${r.receivedQty} to receive but only ${Math.max(0, outstanding)} still in transit.`,
          "insufficient-stock",
        );
      }
      const damagedQty = r.damagedQty ?? 0;
      const goodQty = r.receivedQty - damagedQty;

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
      eventSeqs.push(change.eventSeq);

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

  // After commit: evaluate matching Automation Rules in the same request
  // (ADR-0008). Never throws; a failing rule is recorded, not propagated.
  await runAutomation(db, eventSeqs);
  return result;
}
