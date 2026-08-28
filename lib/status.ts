/**
 * The status language.
 *
 * Every status value across the product resolves here to one of six tones and
 * a human label. Pages never invent a colour for a status; if a new status
 * appears, it gets a row here or it renders as neutral and shows up in review.
 */

import type { StatusTone } from "@/lib/types";

export interface StatusMeta {
  label: string;
  tone: StatusTone;
  /** Short operator-facing explanation, used in tooltips and legends. */
  hint?: string;
}

const STATUS: Record<string, StatusMeta> = {
  /* generic lifecycle */
  draft: { label: "Draft", tone: "neutral", hint: "Not yet submitted. Editable and has no stock effect." },
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
  archived: { label: "Archived", tone: "neutral" },
  discontinued: { label: "Discontinued", tone: "neutral", hint: "No longer purchased. Existing stock is still sellable." },
  cancelled: { label: "Cancelled", tone: "neutral" },
  "on-hold": { label: "On hold", tone: "purple" },
  invited: { label: "Invited", tone: "info" },
  suspended: { label: "Suspended", tone: "danger" },
  operational: { label: "Operational", tone: "success" },
  maintenance: { label: "Maintenance", tone: "warning" },
  closed: { label: "Closed", tone: "success" },

  /* stock health */
  healthy: { label: "Healthy", tone: "success", hint: "Available quantity is comfortably above the reorder point." },
  low: { label: "Low stock", tone: "warning", hint: "Available quantity has fallen below the reorder point." },
  critical: { label: "Critical", tone: "danger", hint: "Under 40% of the reorder point. Reorder now." },
  "out-of-stock": { label: "Out of stock", tone: "danger", hint: "Nothing available to allocate." },
  overstock: { label: "Overstock", tone: "purple", hint: "More than 6× the reorder point. Capital is tied up." },

  /* purchase orders */
  submitted: { label: "Submitted", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  ordered: { label: "Ordered", tone: "info" },
  "partially-received": { label: "Partially received", tone: "warning" },
  received: { label: "Received", tone: "success" },

  /* sales orders */
  confirmed: { label: "Confirmed", tone: "info" },
  reserved: { label: "Reserved", tone: "purple", hint: "Stock is allocated and no longer available to other orders." },
  picking: { label: "Picking", tone: "info" },
  packing: { label: "Packing", tone: "info" },
  shipped: { label: "Shipped", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  backorder: { label: "Backorder", tone: "warning", hint: "Accepted but cannot be fulfilled from current stock." },

  /* payment */
  unpaid: { label: "Unpaid", tone: "warning" },
  partial: { label: "Partly paid", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  refunded: { label: "Refunded", tone: "neutral" },

  /* fulfillment */
  unfulfilled: { label: "Unfulfilled", tone: "neutral" },
  fulfilled: { label: "Fulfilled", tone: "success" },
  returned: { label: "Returned", tone: "purple" },

  /* transfers */
  "pending-approval": { label: "Pending approval", tone: "warning" },
  "in-transit": { label: "In transit", tone: "info" },

  /* adjustments */
  rejected: { label: "Rejected", tone: "danger" },
  applied: { label: "Applied", tone: "success" },

  /* counts */
  scheduled: { label: "Scheduled", tone: "neutral" },
  "in-progress": { label: "In progress", tone: "info" },
  review: { label: "In review", tone: "warning" },

  /* returns */
  requested: { label: "Requested", tone: "warning" },
  inspected: { label: "Inspected", tone: "info" },
  credited: { label: "Credited", tone: "success" },

  /* item condition */
  sellable: { label: "Sellable", tone: "success" },
  damaged: { label: "Damaged", tone: "danger" },
  defective: { label: "Defective", tone: "danger" },
  expired: { label: "Expired", tone: "danger" },

  /* integrations & automation */
  connected: { label: "Connected", tone: "success" },
  syncing: { label: "Syncing", tone: "info" },
  error: { label: "Error", tone: "danger" },
  disconnected: { label: "Disconnected", tone: "neutral" },
  success: { label: "Success", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "neutral" },
  enabled: { label: "Enabled", tone: "success" },
  disabled: { label: "Disabled", tone: "neutral" },

  /* tasks */
  open: { label: "Open", tone: "neutral" },
  done: { label: "Done", tone: "success" },
  overdue: { label: "Overdue", tone: "danger" },

  /* priority */
  critical_priority: { label: "Critical", tone: "danger" },
  high: { label: "High", tone: "warning" },
  normal: { label: "Normal", tone: "info" },
  "low-priority": { label: "Low", tone: "neutral" },
};

export function statusMeta(value: string): StatusMeta {
  return STATUS[value] ?? { label: humanize(value), tone: "neutral" };
}

export function statusTone(value: string): StatusTone {
  return statusMeta(value).tone;
}

export function humanize(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ----------------------------------------------------------- priority ---- */

export function priorityMeta(p: string): StatusMeta {
  switch (p) {
    case "critical":
      return { label: "Critical", tone: "danger" };
    case "high":
      return { label: "High", tone: "warning" };
    case "normal":
      return { label: "Normal", tone: "info" };
    default:
      return { label: "Low", tone: "neutral" };
  }
}

/* ------------------------------------------------------------ workflows -- */

export interface WorkflowStep {
  key: string;
  label: string;
}

/** The document state machines, in the order an operator walks them. */
export const WORKFLOWS = {
  purchaseOrder: [
    { key: "draft", label: "Draft" },
    { key: "submitted", label: "Submitted" },
    { key: "approved", label: "Approved" },
    { key: "ordered", label: "Ordered" },
    { key: "partially-received", label: "Receiving" },
    { key: "received", label: "Received" },
    { key: "closed", label: "Closed" },
  ],
  transfer: [
    { key: "draft", label: "Draft" },
    { key: "pending-approval", label: "Pending approval" },
    { key: "approved", label: "Approved" },
    { key: "in-transit", label: "In transit" },
    { key: "partially-received", label: "Receiving" },
    { key: "received", label: "Received" },
  ],
  salesOrder: [
    { key: "draft", label: "Draft" },
    { key: "confirmed", label: "Confirmed" },
    { key: "reserved", label: "Reserved" },
    { key: "picking", label: "Picking" },
    { key: "packing", label: "Packing" },
    { key: "shipped", label: "Shipped" },
    { key: "delivered", label: "Delivered" },
  ],
  adjustment: [
    { key: "draft", label: "Draft" },
    { key: "pending-approval", label: "Pending approval" },
    { key: "approved", label: "Approved" },
    { key: "applied", label: "Applied" },
  ],
  count: [
    { key: "scheduled", label: "Scheduled" },
    { key: "in-progress", label: "Counting" },
    { key: "review", label: "Review" },
    { key: "approved", label: "Approved" },
    { key: "applied", label: "Applied" },
  ],
  returnDoc: [
    { key: "requested", label: "Requested" },
    { key: "approved", label: "Approved" },
    { key: "in-transit", label: "In transit" },
    { key: "received", label: "Received" },
    { key: "inspected", label: "Inspected" },
    { key: "credited", label: "Credited" },
  ],
} satisfies Record<string, WorkflowStep[]>;

export type WorkflowKey = keyof typeof WORKFLOWS;

/** Statuses that sit outside the happy path and stop the stepper. */
export const TERMINAL_FAILURES = new Set(["cancelled", "rejected"]);
