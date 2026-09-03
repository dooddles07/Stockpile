/**
 * Document number allocation.
 *
 * Every Document number a visitor's creation produces comes from a Postgres
 * sequence, read with `nextval` inside the transaction that writes the
 * Document and formatted here into the exact shape the seeded dataset uses. A
 * created Purchase Order is `PO-2026-1196`, in the same series as the seeded
 * `PO-2026-1195` before it.
 *
 * A sequence rather than `max(number) + 1`: ADR-0010 puts every visitor on one
 * shared account, so two people creating the same Document type at the same
 * moment is the normal case, and a read-then-increment races unless it takes a
 * lock nothing else needs. `nextval` does not race and does not lock. It also
 * does not roll back — a creation that fails burns its number, which is correct
 * for a Document number and not a defect. The unique index on each `number`
 * column is the backstop that turns any future non-sequence allocation into a
 * loud error rather than a duplicate on screen.
 *
 * One sequence per series, not per type: the two kinds of Return share a
 * counter in the generated dataset (`SR-2026-142` and `PR-2026-143` are the
 * same run of numbers), so they share a sequence here too.
 *
 * The seed is the trap: it loads Documents numbered from a fixed base, so every
 * sequence has to be advanced past the highest number it loaded on every run
 * (`advanceDocumentNumbers`, called by `lib/db/seed.ts`) or the first creation
 * collides with a seeded row.
 *
 * This module imports nothing from `./schema` — `schema.ts` imports the
 * registry from here to declare its sequences, so the migration and the
 * allocator cannot drift apart. The table names below are the price of that
 * direction; nothing but the `max(number)` query here reads them.
 */

import { sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

/** The year every seeded Document number carries (`lib/data/store.ts`). */
export const NUMBER_YEAR = 2026;

/**
 * A Drizzle handle a number can be allocated on: the pool, or the open
 * transaction of the creation that needs the number.
 */
export type NumberDb = Pick<NeonDatabase, "execute">;

export type DocumentNumberType =
  | "purchaseOrder"
  | "salesOrder"
  | "transfer"
  | "adjustment"
  | "stockCount"
  | "salesReturn"
  | "purchaseReturn";

type DocumentNumberSpec = {
  /** The Postgres sequence, declared in `schema.ts` and created by migration. */
  sequence: string;
  /** The `PO` in `PO-2026-1195`. */
  prefix: string;
  /** The counter the seeded series starts at, so an empty table still matches. */
  start: number;
  /** Digits the counter is padded to — `CNT-2026-050` pads to 3, not 4. */
  pad: number;
  /** The table this series' seeded numbers live in. */
  table: string;
};

/**
 * Every Document type that can be created, and the shape of its number. The
 * prefix, base and padding mirror the generated dataset exactly — change one
 * here and created Documents stop matching seeded ones.
 */
export const documentNumbers: Record<DocumentNumberType, DocumentNumberSpec> = {
  purchaseOrder: {
    sequence: "purchase_order_number_seq",
    prefix: "PO",
    start: 1000,
    pad: 4,
    table: "purchase_orders",
  },
  salesOrder: {
    sequence: "sales_order_number_seq",
    prefix: "SO",
    start: 4000,
    pad: 4,
    table: "sales_orders",
  },
  transfer: {
    sequence: "transfer_number_seq",
    prefix: "TR",
    start: 200,
    pad: 3,
    table: "transfers",
  },
  adjustment: {
    sequence: "adjustment_number_seq",
    prefix: "ADJ",
    start: 300,
    pad: 4,
    table: "adjustments",
  },
  stockCount: {
    sequence: "stock_count_number_seq",
    prefix: "CNT",
    start: 50,
    pad: 3,
    table: "stock_counts",
  },
  // Both kinds draw on the one `returns` series, as the dataset does.
  salesReturn: {
    sequence: "return_number_seq",
    prefix: "SR",
    start: 100,
    pad: 3,
    table: "returns",
  },
  purchaseReturn: {
    sequence: "return_number_seq",
    prefix: "PR",
    start: 100,
    pad: 3,
    table: "returns",
  },
};

/** One type per distinct sequence — Returns' two kinds share theirs. */
const seriesTypes = [
  ...new Map(
    (Object.keys(documentNumbers) as DocumentNumberType[]).map((type) => [
      documentNumbers[type].sequence,
      type,
    ]),
  ).values(),
];

/** The counter a formatted Document number carries: `ADJ-2026-0395` -> 395. */
export function counterOf(number: string): number {
  return Number(number.split("-")[2]);
}

/**
 * The next number for a Document type, formatted. Pass the open transaction of
 * the creation that needs it; the number is allocated with `nextval`, so two
 * concurrent callers never receive the same one, and a caller that then rolls
 * back leaves its number burned rather than reused.
 */
export async function allocateDocumentNumber(
  db: NumberDb,
  type: DocumentNumberType,
): Promise<string> {
  const spec = documentNumbers[type];
  const result = await db.execute(
    sql`select nextval(${spec.sequence}::regclass)::bigint::int as value`,
  );
  const value = (result.rows[0] as { value: number } | undefined)?.value;
  if (typeof value !== "number") {
    throw new Error(`allocateDocumentNumber: ${spec.sequence} returned no value`);
  }
  return `${spec.prefix}-${NUMBER_YEAR}-${String(value).padStart(spec.pad, "0")}`;
}

/**
 * The highest counter a Document type's table holds, or its base minus one when
 * the table is empty. `split_part` reads the counter back out of the third
 * segment of the stored number; both the seed and `check:numbers` come through
 * here, so the two cannot disagree about where a series has reached.
 */
const ALLOWED_TABLES = new Set(
  Object.values(documentNumbers).map((s) => s.table),
);

export async function highestNumber(db: NumberDb, type: DocumentNumberType): Promise<number> {
  const spec = documentNumbers[type];
  if (!ALLOWED_TABLES.has(spec.table)) {
    throw new Error(`highestNumber: table "${spec.table}" not in allowlist`);
  }
  const result = await db.execute(sql`
    select coalesce(max(split_part(number, '-', 3)::bigint), ${spec.start - 1})::int as value
      from ${sql.raw(spec.table)}
  `);
  return (result.rows[0] as { value: number }).value;
}

/**
 * Advance every sequence past the highest number already in the database. The
 * seed calls this after loading, on every run — including ADR-0010's daily
 * reset — so the first Document a visitor creates continues the seeded series
 * instead of colliding with it. TRUNCATE does not touch a sequence and a
 * re-seed reloads the same numbers, so this cannot be a one-off.
 *
 * The high water mark is read from the loaded rows rather than from the
 * generator's bases, so it stays correct if the dataset changes size.
 */
export async function advanceDocumentNumbers(db: NumberDb): Promise<void> {
  for (const type of seriesTypes) {
    const max = await highestNumber(db, type);
    // `setval(..., n, true)` makes the next `nextval` n + 1.
    await db.execute(
      sql`select setval(${documentNumbers[type].sequence}::regclass, ${max}, true)`,
    );
  }
}
