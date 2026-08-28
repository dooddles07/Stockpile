/**
 * Operational and admin reads: notifications, tasks, automation and
 * integrations config, the audit log. Raw lists — see `reference.ts` for why,
 * and `inventory.ts` for the Sync/async pattern.
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

export function notificationsSync(): AppNotification[] {
  return db.notifications;
}

export async function notifications(): Promise<AppNotification[]> {
  return notificationsSync();
}

export function tasksSync(): TaskItem[] {
  return db.tasks;
}

export async function tasks(): Promise<TaskItem[]> {
  return tasksSync();
}

export function automationRulesSync(): AutomationRule[] {
  return db.automationRules;
}

export async function automationRules(): Promise<AutomationRule[]> {
  return automationRulesSync();
}

export function automationRunsSync(): AutomationRun[] {
  return db.automationRuns;
}

export async function automationRuns(): Promise<AutomationRun[]> {
  return automationRunsSync();
}

export function integrationsSync(): Integration[] {
  return db.integrations;
}

export async function integrations(): Promise<Integration[]> {
  return integrationsSync();
}

export function auditEntriesSync(): AuditEntry[] {
  return db.auditEntries;
}

export async function auditEntries(): Promise<AuditEntry[]> {
  return auditEntriesSync();
}
