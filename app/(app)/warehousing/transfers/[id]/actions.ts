"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { StockChangeError } from "@/lib/domain/stock";
import { dispatchTransfer, receiveTransfer, TransferError } from "@/lib/domain/transfers";

/**
 * The two ends of a Transfer's write path (ticket 14). Per ADR-0005 this file
 * holds no logic: it validates the form, resolves the Actor from the session,
 * and hands off to `dispatchTransfer` / `receiveTransfer`. The permission check,
 * the state machine and the choke-point writes all live below this layer.
 */

const DispatchSchema = z.object({
  intent: z.literal("dispatch"),
  transferId: z.string().min(1),
  carrier: z.string().trim().optional(),
  trackingNumber: z.string().trim().optional(),
});

const ReceiveLineSchema = z.object({
  lineId: z.string().min(1),
  receivedQty: z.coerce.number().int().min(0),
  damagedQty: z.coerce.number().int().min(0).default(0),
});

const ReceiveSchema = z.object({
  intent: z.literal("receive"),
  transferId: z.string().min(1),
  locationId: z.string().min(1),
  note: z.string().trim().default(""),
  lines: z.preprocess((v) => {
    try {
      return JSON.parse(String(v));
    } catch {
      return null;
    }
  }, z.array(ReceiveLineSchema).min(1)),
});

const FormSchema = z.discriminatedUnion("intent", [DispatchSchema, ReceiveSchema]);

export type TransferFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      message: string;
      transferStatus: string;
      lines: { sku: string; qty: number; onHand?: number }[];
    };

export async function submitTransferAction(
  _prev: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
  const parsed = FormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "That transfer action could not be read." };
  }

  const actor = await getCurrentUser();
  const db = getDb();

  try {
    let message: string;
    let transferStatus: string;
    let lines: { sku: string; qty: number; onHand?: number }[];

    if (parsed.data.intent === "dispatch") {
      const r = await dispatchTransfer(
        actor,
        {
          transferId: parsed.data.transferId,
          carrier: parsed.data.carrier || null,
          trackingNumber: parsed.data.trackingNumber || null,
        },
        db,
      );
      transferStatus = r.status;
      message = `${r.number} despatched — ${r.totalShipped} units left the source and are now in transit.`;
      lines = r.lines.map((l) => ({ sku: l.sku, qty: l.shippedQty }));
    } else {
      const r = await receiveTransfer(
        actor,
        {
          transferId: parsed.data.transferId,
          locationId: parsed.data.locationId,
          note: parsed.data.note || undefined,
          lines: parsed.data.lines,
        },
        db,
      );
      transferStatus = r.status;
      message = r.closed
        ? `${r.number} is fully received — ${r.totalReceived} units booked in.`
        : `${r.number} is partially received — ${r.totalReceived} units booked in.`;
      lines = r.lines.map((l) => ({ sku: l.sku, qty: l.receivedQty, onHand: l.onHand }));
    }

    revalidatePath(`/warehousing/transfers/${parsed.data.transferId}`);
    revalidatePath("/warehousing/transfers");
    revalidatePath("/inventory/movements");
    revalidatePath("/inventory/stock-levels");

    return { status: "success", message, transferStatus, lines };
  } catch (error) {
    if (error instanceof TransferError || error instanceof StockChangeError) {
      return { status: "error", message: error.message };
    }
    throw error;
  }
}
