/**
 * Operational and admin reads: notifications, tasks, automation and
 * integrations config, the audit log. Raw lists — see `reference.ts` for why.
 *
 * All Postgres-backed: automation, integrations and audit entries since ticket
 * 06, notifications and tasks since ticket 08. Notifications, tasks, audit
 * entries and automation runs carry a generated `seq` that fixes row order (the
 * generator's array order: newest-first for the inbox / ledger / audit log, the
 * task list in display order) — strip it back off, callers expect the bare
 * shape (same convention as `documents.ts`).
 */

import { cache } from "react";

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

// A dismissed notification is gone from every feed — the bell, the page — so it
// is dropped here rather than at each call site (ticket 12). `dismissed` never
// reaches a caller; like `seq` it is a storage concern, not part of the shape.
export const notifications = cache(
  async (): Promise<AppNotification[]> =>
    (await getDb().select().from(schema.notifications).orderBy(schema.notifications.seq))
      .filter((n) => !n.dismissed)
      .map(({ seq, dismissed, ...notification }) => notification),
);

export const tasks = cache(
  async (): Promise<TaskItem[]> =>
    (await getDb().select().from(schema.tasks).orderBy(schema.tasks.seq)).map(
      ({ seq, ...task }) => task,
    ),
);

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
