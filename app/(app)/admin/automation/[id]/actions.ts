"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AutomationRuleError, setRuleEnabled } from "@/lib/domain/automation";

/**
 * The one write behind the enable/disable toggle on the automation rule screen.
 * Per ADR-0005 it holds no logic: it validates the payload, resolves the Actor
 * from the session, and hands off to `setRuleEnabled`. The permission check and
 * the column write live in the domain function.
 */

const Schema = z.object({ ruleId: z.string().min(1), enabled: z.boolean() });

export type SetRuleEnabledResult = { ok: boolean; message: string };

export async function setRuleEnabledAction(raw: unknown): Promise<SetRuleEnabledResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "That request could not be read." };

  const actor = await getCurrentUser();

  try {
    const row = await setRuleEnabled(actor, parsed.data, getDb());
    revalidatePath("/admin/automation");
    revalidatePath(`/admin/automation/${parsed.data.ruleId}`);
    return { ok: true, message: row.enabled ? "Rule enabled." : "Rule disabled." };
  } catch (error) {
    if (error instanceof AutomationRuleError) return { ok: false, message: error.message };
    throw error;
  }
}
