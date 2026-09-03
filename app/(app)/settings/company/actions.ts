"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { CompanySettingsError, updateCompanySettings } from "@/lib/domain/settings";

/**
 * The write behind the Company settings form. Per ADR-0005 it holds no logic:
 * it validates the payload, resolves the Actor from the session, and delegates.
 * The permission check, the trim and the column write live in the domain
 * function.
 */

const Schema = z.object({
  companyName: z.string().trim().min(1, "Company name is required."),
  companyAddress: z.string().trim().min(1, "Company address is required."),
});

export type SaveCompanySettingsResult = { ok: true } | { ok: false; message: string };

export async function saveCompanySettings(raw: unknown): Promise<SaveCompanySettingsResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That request could not be read." };
  }

  const actor = await getCurrentUser();

  try {
    await updateCompanySettings(actor, parsed.data, getDb());
    revalidatePath("/settings/company");
    // The app shell header and the landing page both name the company.
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof CompanySettingsError) return { ok: false, message: error.message };
    throw error;
  }
}
