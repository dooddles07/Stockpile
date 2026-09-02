/**
 * Dismissing a notification (ticket 12).
 *
 * The `notifications` table is read by the bell in the top bar and by the
 * notifications page, and until this file neither offered a way to clear
 * anything — the list only ever grew. Dismissing is the whole of the write: one
 * boolean column, checked once for permission, and the row is gone from every
 * feed (the accessor in `lib/repo/ops.ts` filters `dismissed` out).
 *
 * No Event, no Movement — nothing about the business changed, only the shared
 * notification feed (one deployment, one company — ADR-0001). Spec story 24 is
 * "as *any* user", so the gate is the one every role that can load the app
 * already passes: `view` on `dashboard`. No seeded Role fails it today; a Role
 * editable down to no dashboard access at all (ticket 13) is still refused
 * here rather than at the page, exactly as every other domain function is
 * (ADR-0004). `notifications.checks.ts` proves that refusal below the UI.
 *
 * Like the other `lib/domain` modules this imports no `server-only` code: the
 * caller passes the Drizzle handle.
 */

import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { type Actor } from "@/lib/domain/stock";

type Db = NeonDatabase<typeof schema>;

export type NotificationErrorCode = "forbidden" | "not-found";

export class NotificationError extends Error {
  constructor(
    message: string,
    readonly code: NotificationErrorCode,
  ) {
    super(message);
    this.name = "NotificationError";
  }
}

export interface DismissedNotification {
  id: string;
}

/**
 * Mark one notification dismissed. Throws `NotificationError` and writes nothing
 * when the Actor's Role cannot see the app or the notification does not exist.
 * Idempotent — dismissing an already-dismissed notification is a no-op that
 * still returns the row.
 */
export async function dismissNotification(
  actor: Actor,
  input: { id: string },
  db: Db,
): Promise<DismissedNotification> {
  if (!can(actor.role, "dashboard", "view")) {
    throw new NotificationError(
      `Your role (${actor.role}) is not allowed to dismiss notifications.`,
      "forbidden",
    );
  }

  const [row] = await db
    .update(schema.notifications)
    .set({ dismissed: true })
    .where(eq(schema.notifications.id, input.id))
    .returning({ id: schema.notifications.id });

  if (!row) {
    throw new NotificationError("That notification could not be found.", "not-found");
  }
  return row;
}
