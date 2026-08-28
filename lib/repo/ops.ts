/**
 * Operational and admin reads: notifications, tasks, automation and
 * integrations config, the audit log. Raw lists — see `reference.ts` for why.
 */

import { db } from "@/lib/data/store";
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

export async function automationRules(): Promise<AutomationRule[]> {
  return db.automationRules;
}

export async function automationRuns(): Promise<AutomationRun[]> {
  return db.automationRuns;
}

export async function integrations(): Promise<Integration[]> {
  return db.integrations;
}

export async function auditEntries(): Promise<AuditEntry[]> {
  return db.auditEntries;
}
