import type { Metadata } from "next";

import { ApproveClient, type ApprovalItem } from "./approve-client";
import { PermissionDenied } from "@/components/states";
import { userById } from "@/lib/repo/inventory";
import { pendingApprovals } from "@/lib/repo/metrics";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Approve",
  description: "Decisions waiting on you, one at a time.",
};

const KIND_LABEL: Record<string, string> = {
  "purchase-order": "Purchase order",
  transfer: "Stock transfer",
  adjustment: "Stock adjustment",
  count: "Stock count",
};

export default async function OperatorApprovePage() {
  const role = await getRole();
  if (!can(role, "approvals")) return <PermissionDenied module="approvals" role={role} />;

  // Only what this role can actually decide. Showing an item the operator can
  // read but not action is a queue that never empties.
  const items: ApprovalItem[] = pendingApprovals()
    .filter((item) => can(role, item.module, "approve"))
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      kindLabel: KIND_LABEL[item.kind] ?? item.kind,
      number: item.number,
      title: item.title,
      subtitle: item.subtitle,
      amount: item.amount,
      requestedBy: userById.get(item.requestedBy)?.name ?? "—",
      createdAt: item.createdAt,
      href: item.href,
    }));

  return <ApproveClient items={items} />;
}
