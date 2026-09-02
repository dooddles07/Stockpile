"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { ApprovalError, decideOnDocument } from "@/lib/domain/approvals";

/**
 * The one write behind both approve surfaces — the Approvals queue and the
 * handheld approve cards (ticket 11). Per ADR-0005 it holds no logic: it
 * validates the payload, resolves the Actor from the session, and hands off to
 * `decideOnDocument`. The permission check (keyed by the Document's type), the
 * pending-status guard, the status write and the Event all live in the domain
 * function.
 */

const Schema = z.object({
  type: z.enum(["purchase-order", "transfer", "adjustment", "count"]),
  id: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().optional(),
});

export type ApprovalActionResult = { ok: boolean; message: string };

export async function decideOnApproval(raw: unknown): Promise<ApprovalActionResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "That decision could not be read." };

  // The "a rejection needs a reason" rule lives in `decide` (ADR-0005: the
  // action holds no logic) and surfaces below as an ApprovalError.
  const actor = await getCurrentUser();

  try {
    const result = await decideOnDocument(actor, parsed.data, getDb());
    for (const path of [
      "/approvals",
      "/operator/approve",
      "/purchasing/purchase-orders",
      "/warehousing/transfers",
      "/inventory/adjustments",
      "/inventory/counts",
    ]) {
      revalidatePath(path);
    }
    return {
      ok: true,
      message:
        result.decision === "approve"
          ? `${result.number} approved.`
          : `${result.number} rejected.`,
    };
  } catch (error) {
    if (error instanceof ApprovalError) return { ok: false, message: error.message };
    throw error;
  }
}
