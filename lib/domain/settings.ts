/**
 * Company settings — the one global setting worth having (ticket 16).
 *
 * A name and a trading address are genuinely global: they belong nowhere else
 * in the model and have real consumers (the app shell header, the landing
 * page). They live in a single-row `settings` table — a record with named
 * typed columns, not a key-value store — created by the seed and updated in
 * place, never inserted or deleted at runtime.
 *
 * Like the other `lib/domain` modules this imports no `server-only` code: the
 * caller passes the Drizzle handle, and the permission matrix must already be
 * hydrated (`hydrateRoles`, reached through `getRole()` on the request path).
 * `settings` is Reference Data (CONTEXT.md), so this appends no Event — it is
 * an ordinary `UPDATE`, plus one audit row because the Settings page states
 * every change there is logged.
 */

import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { newId } from "@/lib/domain/reference";
import type { Actor } from "@/lib/domain/stock";

type Db = NeonDatabase<typeof schema>;

/** The single settings row's fixed id — the seed creates it, nothing else does. */
export const SETTINGS_ROW_ID = "SET-COMPANY";

/** What the seed loads into the row and the truncate-and-reseed restores. */
export const COMPANY_SETTINGS_SEED = {
  id: SETTINGS_ROW_ID,
  companyName: "Stockpile",
  companyAddress: "4400 Corporate Exchange Blvd, Columbus, Ohio 43231",
};

export interface CompanySettings {
  companyName: string;
  companyAddress: string;
}

export type CompanySettingsErrorCode = "forbidden" | "invalid" | "not-found";

export class CompanySettingsError extends Error {
  constructor(
    message: string,
    readonly code: CompanySettingsErrorCode,
  ) {
    super(message);
    this.name = "CompanySettingsError";
  }
}

/**
 * The stored company identity. Falls back to the seed values if the row is
 * somehow absent, so a consumer that names the company never has to render a
 * blank.
 */
export async function companySettings(db: Db): Promise<CompanySettings> {
  const [row] = await db
    .select({
      companyName: schema.settings.companyName,
      companyAddress: schema.settings.companyAddress,
    })
    .from(schema.settings)
    .where(eq(schema.settings.id, SETTINGS_ROW_ID));
  return (
    row ?? {
      companyName: COMPANY_SETTINGS_SEED.companyName,
      companyAddress: COMPANY_SETTINGS_SEED.companyAddress,
    }
  );
}

/**
 * Update the company name and address. The permission check is first (ADR-0004):
 * an Actor whose Role cannot edit `settings` is refused before anything is read,
 * whether it arrives through the server action or a later REST caller. Trimmed
 * input; both fields are required. Idempotent — a no-op change writes no audit
 * row.
 */
export async function updateCompanySettings(
  actor: Actor,
  input: CompanySettings,
  db: Db,
): Promise<CompanySettings> {
  if (!can(actor.role, "settings", "edit")) {
    throw new CompanySettingsError(
      `Your role (${actor.role}) is not allowed to edit settings.`,
      "forbidden",
    );
  }

  const companyName = input.companyName.trim();
  const companyAddress = input.companyAddress.trim();
  if (!companyName || !companyAddress) {
    throw new CompanySettingsError("Company name and address are both required.", "invalid");
  }

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.id, SETTINGS_ROW_ID))
      .for("update");
    if (!before) {
      throw new CompanySettingsError(
        "The settings row is missing — reseed the database.",
        "not-found",
      );
    }

    if (before.companyName === companyName && before.companyAddress === companyAddress) {
      return { companyName, companyAddress };
    }

    await tx
      .update(schema.settings)
      .set({ companyName, companyAddress })
      .where(eq(schema.settings.id, SETTINGS_ROW_ID));

    await tx.insert(schema.auditEntries).values({
      id: newId("AUD"),
      ts: new Date().toISOString(),
      userId: actor.id,
      action: "update",
      entity: "Settings",
      entityId: SETTINGS_ROW_ID,
      entityLabel: "Company settings",
      field: null,
      before: `${before.companyName} · ${before.companyAddress}`,
      after: `${companyName} · ${companyAddress}`,
      ip: "internal",
      device: "company settings page",
    });

    return { companyName, companyAddress };
  });
}
