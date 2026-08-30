import Link from "next/link";
import { Undo2 } from "lucide-react";

import { Section } from "@/components/record/field-grid";
import { StatusBadge } from "@/components/status/status-badge";
import { money } from "@/lib/format";

/**
 * "Returns against this order" — the block a Sales Order and a Purchase Order
 * detail page both show so a Return is visible from the Document it was raised
 * against (ticket 16). Renders nothing when there are no Returns.
 */
export function ReturnsAgainstOrder({
  returns,
  basePath,
}: {
  returns: { id: string; number: string; reason: string; status: string; refundTotal: number }[];
  /** `/sales/returns` or `/purchasing/returns`. */
  basePath: string;
}) {
  if (returns.length === 0) return null;

  return (
    <Section title="Returns against this order">
      <ul className="grid gap-2">
        {returns.map((r) => (
          <li key={r.id}>
            <Link
              href={`${basePath}/${r.id}`}
              className="flex items-start justify-between gap-3 rounded-md border p-2.5 transition-colors hover:bg-surface-hover"
            >
              <span className="grid min-w-0 gap-0.5">
                <span className="flex items-center gap-1.5">
                  <Undo2 className="size-3 text-muted-foreground" aria-hidden />
                  <span className="text-code font-medium">{r.number}</span>
                </span>
                <span className="truncate text-caption text-muted-foreground">{r.reason}</span>
              </span>
              <span className="grid shrink-0 justify-items-end gap-1">
                <StatusBadge status={r.status} />
                <span className="text-caption text-muted-foreground">{money(r.refundTotal)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
