/**
 * Operational and admin reads: notifications, tasks, automation and
 * integrations config, the audit log. Raw lists — see `reference.ts` for why.
 *
 * Automation, integrations and audit entries are Postgres-backed (ticket 06).
 * Notifications and tasks still read the in-memory dataset — they belong to a
 * later ticket and have no table yet.
 */

import { cache } from "react";

import { db } from "@/lib/data/store";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import type {
  AppNotification,
  AuditEntry,
  AutomationRule,
  AutomationRun,
  Integration,
  TaskItem,
} from "@/lib/types";

export async function notifications(): Promise<AppNotification[]> {
  return db.notifications;
}

export async function tasks(): Promise<TaskItem[]> {
  return db.tasks;
}

export const automationRules = cache(
  (): Promise<AutomationRule[]> =>
    getDb().select().from(schema.automationRules).orderBy(schema.automationRules.id),
);

export const integrations = cache(
  (): Promise<Integration[]> =>
    getDb().select().from(schema.integrations).orderBy(schema.integrations.id),
);

// `seq` is the generated insert order; the seed loads these newest-first, so
// `ORDER BY seq` reproduces it. Strip the column back off — the shape callers
// expect has no `seq` (same convention as `documents.ts`).
export const auditEntries = cache(
  async (): Promise<AuditEntry[]> =>
    (await getDb().select().from(schema.auditEntries).orderBy(schema.auditEntries.seq)).map(
      ({ seq, ...entry }) => entry,
    ),
);

export const automationRuns = cache(
  async (): Promise<AutomationRun[]> =>
    (await getDb().select().from(schema.automationRuns).orderBy(schema.automationRuns.seq)).map(
      ({ seq, ...run }) => run,
    ),
);
