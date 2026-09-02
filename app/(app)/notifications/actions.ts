"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { dismissNotification, NotificationError } from "@/lib/domain/notifications";

/**
 * The one write behind the dismiss control on the notifications page (ticket
 * 12). Per ADR-0005 it holds no logic: it validates the payload, resolves the
 * Actor from the session, and hands off to `dismissNotification`. The
 * permission check and the column write live in the domain function.
 */

const Schema = z.object({ id: z.string().min(1) });

export type DismissNotificationResult = { ok: boolean; message: string };

export async function dismissNotificationAction(
  raw: unknown,
): Promise<DismissNotificationResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "That notification could not be read." };

  const actor = await getCurrentUser();

  try {
    await dismissNotification(actor, parsed.data, getDb());
    // The bell lives in the app layout, so revalidate the whole segment, not
    // just this page.
    revalidatePath("/", "layout");
    return { ok: true, message: "Notification dismissed." };
  } catch (error) {
    if (error instanceof NotificationError) return { ok: false, message: error.message };
    throw error;
  }
}
