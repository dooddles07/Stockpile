/**
 * Automation execution after commit (ticket 17).
 *
 * ADR-0008: when a transaction that appended an Event commits, matching
 * Automation Rules evaluate immediately, in-process, in the same request —
 * there is no scheduler, no queue, no background worker. `runAutomation` is
 * that mechanism. A request-path domain function that appends Events calls it
 * once, straight after its transaction resolves, handing it the `seq` of every
 * Event that transaction wrote:
 *
 *     const seqs: number[] = [];
 *     const result = await db.transaction(async (tx) => {
 *       const applied = await applyStockChange(actor, ..., tx);   // Event committed on resolve
 *       seqs.push(applied.eventSeq);
 *       ...
 *     });
 *     await runAutomation(db, seqs);   // rules see exactly those Events
 *     return result;
 *
 * Passing the Event seqs — rather than tracking a stream position — keeps this
 * off any shared lock: each request evaluates its own Events and nothing else,
 * so two stock operations never serialize on automation (ADR-0006 keeps
 * contention per product-location, and ADR-0008 says rule actions must stay
 * cheap). Call it with the pooled `db` the domain function received, after its
 * transaction has committed — never with an open `tx`, or the rules would run
 * before the commit they are meant to react to.
 *
 * Guarantees the ticket turns on:
 *
 *  - Rules never run inside the triggering transaction — the call site is after
 *    `await db.transaction(...)`. A rolled-back operation appended no Event and
 *    passes no seq, so nothing evaluates either way.
 *
 *  - A failing rule never fails the operation that triggered it. Each rule
 *    evaluation is wrapped: a throw becomes a `failed` run row, not a rejected
 *    request. The whole function is wrapped again, so an engine-level fault is
 *    swallowed and logged. The stock change already committed.
 *
 *  - Automation is attributable. Every run row carries `actorId =
 *    SYSTEM_ACTOR.id`; automation acts as a designated Actor, not anonymously
 *    (ADR-0004).
 *
 * Scope (ADR-0008, ticket 17): this is the engine, not the language. The
 * `trigger` / `conditions` / `actions` columns stay untyped free text and
 * nothing here parses them. What a rule *does* is a hardcoded handler keyed by
 * rule id; a rule with no handler is not executable and is skipped without a
 * run row. The one real handler is bound to the seeded rule `AUT-001` ("Low
 * stock alert…", trigger "Available quantity falls below reorder point") — the
 * canonical "stock crossed its reorder point" Event from ADR-0008. A second id,
 * used only by `automation.checks.ts`, always throws, to prove a failing rule
 * is isolated. Modelling the vocabulary so rules stop being hardcoded is
 * separate work; the seeded rule's `runCount` / `successRate` / `lastRunAt`
 * rollups are likewise left as the dataset set them — the `automation_runs`
 * rows are the record.
 *
 * Like `stock.ts` this imports no `server-only` code: the caller passes the
 * Drizzle handle (`getDb()` on the request path, an own Pool in the checks).
 */

import { asc, eq, inArray } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { SYSTEM_ACTOR, type Actor } from "@/lib/domain/stock";
import type { AutomationRun } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

/** The seeded rule the reorder handler is bound to ("Low stock alert to
 *  inventory manager"). Keyed by id — its free-text columns are not parsed. */
export const REORDER_RULE_ID = "AUT-001";

/** A rule that always throws. Not seeded — only `automation.checks.ts` inserts
 *  it, to prove a failing rule is recorded as a `failed` run without failing
 *  the triggering operation. */
export const CANARY_FAIL_RULE_ID = "RULE-CANARY-FAIL";

/**
 * What an executable rule does. Returns a message when the rule matched and
 * acted (→ a `success` run), or `null` when its trigger did not match this
 * Event (→ no run row; a non-match is not an evaluation to record). A throw
 * becomes a `failed` run.
 */
type Handler = (db: Db, payload: Record<string, unknown>) => Promise<string | null>;

const HANDLERS: Record<string, Handler> = {
  [REORDER_RULE_ID]: reorderAlert,
  [CANARY_FAIL_RULE_ID]: async () => {
    throw new Error("canary: deliberate rule failure");
  },
};

async function reorderAlert(db: Db, payload: Record<string, unknown>): Promise<string | null> {
  const productId = payload.productId;
  const before = payload.onHandBefore;
  const after = payload.onHandAfter;
  if (typeof productId !== "string" || typeof before !== "number" || typeof after !== "number") {
    return null; // not a stock-movement Event
  }
  if (after >= before) return null; // on-hand did not fall

  const [product] = await db
    .select({
      sku: schema.products.sku,
      reorderPoint: schema.products.reorderPoint,
      reorderQty: schema.products.reorderQty,
    })
    .from(schema.products)
    .where(eq(schema.products.id, productId));
  if (!product) return null;

  // Fire only on the crossing — "the moment stock crosses its reorder point"
  // (spec story 38) — not on every later decrease while already below.
  const crossed = before > product.reorderPoint && after <= product.reorderPoint;
  if (!crossed) return null;

  return `${product.sku} fell to ${after}, at or below its reorder point of ${product.reorderPoint} — reorder ${product.reorderQty}.`;
}

export interface AutomationSummary {
  /** Run rows written (matches + failures). */
  recorded: number;
}

/**
 * Evaluate every enabled Automation Rule against the Events named by `eventSeqs`
 * (the seqs a just-committed transaction wrote), recording each evaluation as a
 * run. Call once, after the transaction has committed. Never throws.
 */
export async function runAutomation(db: Db, eventSeqs: number[]): Promise<AutomationSummary> {
  if (eventSeqs.length === 0) return { recorded: 0 };
  try {
    const events = await db
      .select({ seq: schema.events.seq, payload: schema.events.payload })
      .from(schema.events)
      .where(inArray(schema.events.seq, eventSeqs))
      .orderBy(asc(schema.events.seq));
    if (events.length === 0) return { recorded: 0 };

    const rules = await db
      .select()
      .from(schema.automationRules)
      .where(eq(schema.automationRules.enabled, true));

    let recorded = 0;
    for (const event of events) {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      for (const rule of rules) {
        const handler = HANDLERS[rule.id];
        if (!handler) continue; // free-text rule, no modelled vocabulary (ADR-0008)
        const startedAt = Date.now();
        try {
          const message = await handler(db, payload);
          if (message === null) continue; // trigger did not match
          await recordRun(db, rule.id, "success", Date.now() - startedAt, 1, message);
          recorded++;
        } catch (err) {
          await recordRun(
            db,
            rule.id,
            "failed",
            Date.now() - startedAt,
            0,
            err instanceof Error ? err.message : String(err),
          );
          recorded++;
        }
      }
    }
    return { recorded };
  } catch (err) {
    // Engine-level fault (not a rule throwing — those are caught above). The
    // triggering operation has already committed; it must not fail because an
    // alert did (ADR-0008). Swallow, log, move on.
    console.error("[automation] runAutomation failed:", err);
    return { recorded: 0 };
  }
}

export type AutomationRuleErrorCode = "forbidden" | "not-found";

export class AutomationRuleError extends Error {
  constructor(
    message: string,
    readonly code: AutomationRuleErrorCode,
  ) {
    super(message);
    this.name = "AutomationRuleError";
  }
}

/**
 * Enable or disable one Automation Rule. This is the whole write behind the
 * toggle on the rule screen: one boolean column, checked once for permission.
 * `runAutomation` already filters on `enabled = true` (see the query above), so
 * a disabled rule stops evaluating on the next Event with no other change.
 *
 * No Event, no Movement — automation configuration is Reference Data (ADR-0002),
 * not part of the event-sourced stream. Throws `AutomationRuleError` and writes
 * nothing when the Actor's Role cannot manage automation or the rule is gone.
 * Idempotent: setting a rule to the state it is already in returns the row.
 */
export async function setRuleEnabled(
  actor: Actor,
  input: { ruleId: string; enabled: boolean },
  db: Db,
): Promise<{ id: string; enabled: boolean }> {
  if (!can(actor.role, "automation", "manage")) {
    throw new AutomationRuleError(
      `Your role (${actor.role}) is not allowed to enable or disable automation rules.`,
      "forbidden",
    );
  }

  const [row] = await db
    .update(schema.automationRules)
    .set({ enabled: input.enabled })
    .where(eq(schema.automationRules.id, input.ruleId))
    .returning({ id: schema.automationRules.id, enabled: schema.automationRules.enabled });

  if (!row) {
    throw new AutomationRuleError("That automation rule could not be found.", "not-found");
  }
  return row;
}

async function recordRun(
  db: Db,
  ruleId: string,
  outcome: AutomationRun["outcome"],
  durationMs: number,
  affected: number,
  message: string,
): Promise<void> {
  await db.insert(schema.automationRuns).values({
    id: `ARUN-${crypto.randomUUID()}`,
    ruleId,
    ts: new Date().toISOString(),
    outcome,
    affected,
    durationMs,
    message,
    actorId: SYSTEM_ACTOR.id,
  });
}
