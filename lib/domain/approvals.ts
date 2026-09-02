/**
 * Approve and reject, across the four Documents that carry a pending status
 * (ticket 11): a Purchase Order in `submitted`, a Transfer or an Adjustment in
 * `pending-approval`, a Stock Count in `review`. Until this file none of those
 * transitions had a domain function — the Approvals queue read the pending rows
 * and offered no decision, and the handheld approve surface only toasted.
 *
 * The shape is written once in `decide` and each Document type is a thin
 * descriptor. Approve and reject differ per type only in:
 *
 *  - which permission is checked (`approve` on the type's own module),
 *  - which pending status the Document must already be in,
 *  - which status the decision writes, and
 *  - which table and timestamp column that write touches.
 *
 * `decide` locks the Document, refuses one that is not in the pending status it
 * claims (rather than silently re-approving it), records the deciding Actor and
 * the time, and appends an Event. A rejection additionally requires a reason
 * and is terminal for that Document.
 *
 * An approval appends **no Movement**. Nothing about approving a Document moves
 * stock; the stock consequence happens later when the approved Document is
 * received, dispatched or applied. Approving a Purchase Order writes `ordered`
 * — far enough that the existing `receiveGoods` will book a delivery against it
 * — so the raise -> approve -> receive path is continuous.
 *
 * Like `lib/domain/stock.ts` this imports no `server-only` code: the caller
 * passes the Drizzle handle (`getDb()` on the request path, an own `Pool` for
 * `approvals.checks.ts`). The permission matrix must already be hydrated.
 *
 * ADR-0004 — the permission check is here, before the transaction opens, not
 * the queue's render gate. ADR-0008 — matching Automation Rules evaluate after
 * the commit; no rule acts on a decision Event today, but the call keeps the
 * shape every Event-appending flow shares.
 */

import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { runAutomation } from "@/lib/domain/automation";
import { type Actor } from "@/lib/domain/stock";
import { newId } from "@/lib/domain/reference";
import type {
  AdjustmentStatus,
  ApprovalEvent,
  CountStatus,
  ModuleKey,
  POStatus,
  TransferStatus,
} from "@/lib/types";

type Db = NeonDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type DocumentType = "purchase-order" | "transfer" | "adjustment" | "count";
export type ApprovalDecision = "approve" | "reject";

export type ApprovalErrorCode = "forbidden" | "not-found" | "wrong-state" | "invalid";

export class ApprovalError extends Error {
  constructor(
    message: string,
    readonly code: ApprovalErrorCode,
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}

export interface DecideInput {
  id: string;
  decision: ApprovalDecision;
  /** Required — and non-blank — for a rejection; ignored for an approval. */
  reason?: string;
}

export interface ApprovalDecisionResult {
  id: string;
  type: DocumentType;
  number: string;
  decision: ApprovalDecision;
  /** The status the Document is now in. */
  status: string;
}

interface DecisionPatch {
  status: string;
  /** The deciding Actor — written to `approvedBy` only on an approval, so a
   *  rejected Document is never left reading as "approved by" the rejecter.
   *  The rejecter is still on the Event and in the approval log. */
  approvedBy: string | undefined;
  now: string;
  decision: ApprovalDecision;
  /** The full new approval log, or null for a Document type that keeps none. */
  approvals: ApprovalEvent[] | null;
}

interface DocKind {
  type: DocumentType;
  module: ModuleKey;
  /** Lowercase, for messages — "purchase order", "stock count". */
  label: string;
  /** The status the Document must be in for a decision to be valid. */
  pending: string;
  statusOnApprove: string;
  statusOnReject: string;
  /** Event type prefix — `${eventType}-approved` / `${eventType}-rejected`. */
  eventType: string;
  /** Key the Document id is written under in the Event payload. */
  payloadKey: string;
  /** Lock the row `FOR UPDATE`; undefined when there is no such row. `approvals`
   *  is omitted for a type that keeps no log. */
  lock: (
    tx: Tx,
    id: string,
  ) => Promise<{ status: string; number: string; approvals?: ApprovalEvent[] } | undefined>;
  /** Write the decided status, the deciding Actor, the approve-time stamp and
   *  the appended log in one update. */
  write: (tx: Tx, id: string, patch: DecisionPatch) => Promise<void>;
}

const PURCHASE_ORDER: DocKind = {
  type: "purchase-order",
  module: "purchase-orders",
  label: "purchase order",
  pending: "submitted",
  // Far enough to be receivable through the existing `receiveGoods`
  // (RECEIVABLE_PO_STATUSES) — approving commits the spend.
  statusOnApprove: "ordered",
  statusOnReject: "cancelled",
  eventType: "purchase-order",
  payloadKey: "purchaseOrderId",
  lock: async (tx, id) => {
    const [row] = await tx
      .select({
        status: schema.purchaseOrders.status,
        number: schema.purchaseOrders.number,
        approvals: schema.purchaseOrders.approvals,
      })
      .from(schema.purchaseOrders)
      .where(eq(schema.purchaseOrders.id, id))
      .for("update");
    return row;
  },
  write: async (tx, id, patch) => {
    await tx
      .update(schema.purchaseOrders)
      .set({
        status: patch.status as POStatus,
        approvedBy: patch.approvedBy,
        approvals: patch.approvals ?? undefined,
        ...(patch.decision === "approve" ? { orderedAt: patch.now } : {}),
      })
      .where(eq(schema.purchaseOrders.id, id));
  },
};

const TRANSFER: DocKind = {
  type: "transfer",
  module: "transfers",
  label: "transfer",
  pending: "pending-approval",
  statusOnApprove: "approved",
  statusOnReject: "cancelled",
  eventType: "transfer",
  payloadKey: "transferId",
  lock: async (tx, id) => {
    const [row] = await tx
      .select({
        status: schema.transfers.status,
        number: schema.transfers.number,
        approvals: schema.transfers.approvals,
      })
      .from(schema.transfers)
      .where(eq(schema.transfers.id, id))
      .for("update");
    return row;
  },
  write: async (tx, id, patch) => {
    await tx
      .update(schema.transfers)
      .set({
        status: patch.status as TransferStatus,
        approvedBy: patch.approvedBy,
        approvals: patch.approvals ?? undefined,
        ...(patch.decision === "approve" ? { approvedAt: patch.now } : {}),
      })
      .where(eq(schema.transfers.id, id));
  },
};

const ADJUSTMENT: DocKind = {
  type: "adjustment",
  module: "adjustments",
  label: "adjustment",
  pending: "pending-approval",
  statusOnApprove: "approved",
  statusOnReject: "rejected",
  eventType: "adjustment",
  payloadKey: "adjustmentId",
  lock: async (tx, id) => {
    const [row] = await tx
      .select({
        status: schema.adjustments.status,
        number: schema.adjustments.number,
        approvals: schema.adjustments.approvals,
      })
      .from(schema.adjustments)
      .where(eq(schema.adjustments.id, id))
      .for("update");
    return row;
  },
  write: async (tx, id, patch) => {
    await tx
      .update(schema.adjustments)
      .set({
        status: patch.status as AdjustmentStatus,
        approvedBy: patch.approvedBy,
        approvals: patch.approvals ?? undefined,
      })
      .where(eq(schema.adjustments.id, id));
  },
};

const STOCK_COUNT: DocKind = {
  type: "count",
  module: "counts",
  label: "stock count",
  pending: "review",
  statusOnApprove: "approved",
  statusOnReject: "cancelled",
  eventType: "stock-count",
  payloadKey: "stockCountId",
  lock: async (tx, id) => {
    // `stock_counts` keeps no `approvals` jsonb — the Event is the decision
    // record. `approvedBy` still carries the deciding Actor.
    const [row] = await tx
      .select({ status: schema.stockCounts.status, number: schema.stockCounts.number })
      .from(schema.stockCounts)
      .where(eq(schema.stockCounts.id, id))
      .for("update");
    return row;
  },
  write: async (tx, id, patch) => {
    await tx
      .update(schema.stockCounts)
      .set({ status: patch.status as CountStatus, approvedBy: patch.approvedBy })
      .where(eq(schema.stockCounts.id, id));
  },
};

const KINDS: Record<DocumentType, DocKind> = {
  "purchase-order": PURCHASE_ORDER,
  transfer: TRANSFER,
  adjustment: ADJUSTMENT,
  count: STOCK_COUNT,
};

/**
 * Decide on one Document. Throws `ApprovalError` and writes nothing when the
 * Actor's Role cannot approve this type, a rejection carries no reason, the
 * Document is missing, or it is not in its pending status. On success the
 * status, the deciding Actor and — for an approval — the time are written, an
 * Event is appended, and no Movement is.
 */
async function decide(
  actor: Actor,
  kind: DocKind,
  input: DecideInput,
  db: Db,
): Promise<ApprovalDecisionResult> {
  const approving = input.decision === "approve";
  const verb = approving ? "approved" : "rejected";

  // ADR-0004: permission before anything else — a caller reaching this directly
  // (automation, a REST layer, a check script) is refused exactly as one coming
  // through the queue would be.
  if (!can(actor.role, kind.module, "approve")) {
    throw new ApprovalError(
      `Your role (${actor.role}) is not allowed to approve ${kind.label}s.`,
      "forbidden",
    );
  }

  const reason = input.reason?.trim() ?? "";
  if (!approving && !reason) {
    throw new ApprovalError("A rejection needs a reason.", "invalid");
  }

  let eventSeq = 0;
  const result = await db.transaction(async (tx) => {
    const doc = await kind.lock(tx, input.id);
    if (!doc) {
      throw new ApprovalError(`That ${kind.label} could not be found.`, "not-found");
    }
    if (doc.status !== kind.pending) {
      throw new ApprovalError(
        `${doc.number} is ${doc.status}; only a ${kind.label} awaiting a decision can be ${verb}.`,
        "wrong-state",
      );
    }

    const toStatus = approving ? kind.statusOnApprove : kind.statusOnReject;
    const now = new Date().toISOString();

    const approvals: ApprovalEvent[] | null = doc.approvals
      ? [
          ...doc.approvals,
          {
            id: newId("AE"),
            ts: now,
            userId: actor.id,
            action: verb,
            ...(reason ? { note: reason } : {}),
          },
        ]
      : null;

    await kind.write(tx, input.id, {
      status: toStatus,
      approvedBy: approving ? actor.id : undefined,
      now,
      decision: input.decision,
      approvals,
    });

    // The Event is the decision record (ADR-0002, ADR-0003); the status write
    // above is its projection and commits with it.
    const [event] = await tx
      .insert(schema.events)
      .values({
        type: `${kind.eventType}-${verb}`,
        actorId: actor.id,
        payload: {
          [kind.payloadKey]: input.id,
          number: doc.number,
          from: kind.pending,
          to: toStatus,
          reason: reason || null,
        },
      })
      .returning({ seq: schema.events.seq });
    eventSeq = event.seq;

    return {
      id: input.id,
      type: kind.type,
      number: doc.number,
      decision: input.decision,
      status: toStatus,
    } satisfies ApprovalDecisionResult;
  });

  // After commit: evaluate matching Automation Rules in the same request
  // (ADR-0008). Never throws; a failing rule is recorded, not propagated.
  await runAutomation(db, [eventSeq]);
  return result;
}

/* --------------------------------------------------- per-type thin wrappers */

export const decideOnPurchaseOrder = (actor: Actor, input: DecideInput, db: Db) =>
  decide(actor, PURCHASE_ORDER, input, db);

export const decideOnTransfer = (actor: Actor, input: DecideInput, db: Db) =>
  decide(actor, TRANSFER, input, db);

export const decideOnAdjustment = (actor: Actor, input: DecideInput, db: Db) =>
  decide(actor, ADJUSTMENT, input, db);

export const decideOnStockCount = (actor: Actor, input: DecideInput, db: Db) =>
  decide(actor, STOCK_COUNT, input, db);

/** The queue and the handheld surface get the type at runtime; dispatch on it. */
export const decideOnDocument = (
  actor: Actor,
  input: DecideInput & { type: DocumentType },
  db: Db,
) => decide(actor, KINDS[input.type], input, db);
