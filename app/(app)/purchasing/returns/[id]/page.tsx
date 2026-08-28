import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Download, Printer, Undo2 } from "lucide-react";

import { RecordHeader, StatStrip } from "@/components/record/record-header";
import { FieldGrid, Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { WorkflowStepper } from "@/components/status/workflow-stepper";
import { StatusBadge } from "@/components/status/status-badge";
import { PermissionDenied } from "@/components/states";
import { returns as allReturns } from "@/lib/repo/documents";
import {
  customers as allCustomers,
  indexById,
  products as allProducts,
  suppliers as allSuppliers,
  users as allUsers,
  warehouses as allWarehouses,
} from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { date, dateTime, money, plural, qty } from "@/lib/format";
import type { ModuleKey } from "@/lib/types";
import { ActionButton } from "@/components/actions/action-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const doc = (await allReturns()).find((r) => r.id === id);
  return doc
    ? { title: doc.number, description: `${doc.kind === "purchase" ? "Purchase" : "Sales"} return — ${doc.reason}.` }
    : { title: "Return not found" };
}

export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getRole();
  const { id } = await params;
  const doc = (await allReturns()).find((r) => r.id === id);
  if (!doc) notFound();

  const moduleKey: ModuleKey = doc.kind === "purchase" ? "purchase-returns" : "sales-returns";
  if (!can(role, moduleKey)) return <PermissionDenied module={moduleKey} role={role} />;

  const isPurchase = doc.kind === "purchase";
  const productById = await indexById(allProducts);
  const userById = await indexById(allUsers);
  const warehouseById = await indexById(allWarehouses);
  const partner = isPurchase
    ? (await allSuppliers()).find((s) => s.id === doc.partnerId)
    : (await allCustomers()).find((c) => c.id === doc.partnerId);
  const warehouse = warehouseById.get(doc.warehouseId);

  const units = doc.lines.reduce((s, l) => s + l.quantity, 0);
  const restockLines = doc.lines.filter((l) => l.restock);
  const restockUnits = restockLines.reduce((s, l) => s + l.quantity, 0);
  const scrapUnits = units - restockUnits;

  const listHref = isPurchase ? "/purchasing/returns" : "/sales/returns";
  const partnerHref = isPurchase
    ? `/purchasing/suppliers/${doc.partnerId}`
    : `/sales/customers/${doc.partnerId}`;
  const sourceHref = isPurchase
    ? `/purchasing/purchase-orders/${doc.sourceOrderId}`
    : `/sales/orders/${doc.sourceOrderId}`;

  return (
    <>
      <RecordHeader
        crumbs={[
          {
            label: isPurchase ? "Purchasing" : "Sales",
            href: isPurchase ? "/purchasing/purchase-orders" : "/sales/orders",
          },
          { label: isPurchase ? "Purchase returns" : "Sales returns", href: listHref },
          { label: doc.number },
        ]}
        backHref={listHref}
        backLabel={isPurchase ? "Purchase returns" : "Sales returns"}
        title={doc.number}
        subtitle={doc.reason}
        badge={<StatusBadge status={doc.status} size="md" />}
        meta={
          <>
            <span className="text-caption text-muted-foreground">
              {isPurchase ? "To" : "From"}{" "}
              <Link href={partnerHref} className="font-medium text-foreground hover:underline">
                {partner?.name}
              </Link>
            </span>
            <span className="text-caption text-muted-foreground">
              against{" "}
              <Link href={sourceHref} className="text-code hover:underline">
                {doc.sourceOrderNumber}
              </Link>
            </span>
            <span className="text-caption text-muted-foreground">
              {plural(doc.lines.length, "line")} · {qty(units)} units
            </span>
          </>
        }
        actions={
          <>
            <ActionButton
              variant="outline" size="sm" className="h-8"
              feedback="Sent to printer"
              detail={`${doc.number} is queued on the default printer.`}
            >
              <Printer className="size-3.5" aria-hidden />
              Print
            </ActionButton>
            {can(role, moduleKey, "export") && (
              <ActionButton
                variant="outline" size="sm" className="h-8"
                feedback="Export started"
                detail={`A PDF copy of ${doc.number} downloads once it is rendered.`}
              >
                <Download className="size-3.5" aria-hidden />
                Export
              </ActionButton>
            )}
          </>
        }
      >
        <div className="grid gap-3">
          <WorkflowStepper workflow="returnDoc" status={doc.status} />
          <StatStrip columns={5}>
            <StatTile label="Lines" value={doc.lines.length} />
            <StatTile label="Units" value={qty(units)} />
            <StatTile
              label={isPurchase ? "Leaving stock" : "Back to stock"}
              value={qty(restockUnits)}
              tone={restockUnits > 0 ? "success" : "neutral"}
            />
            <StatTile
              label="Scrapped"
              value={qty(scrapUnits)}
              tone={scrapUnits > 0 ? "danger" : "neutral"}
              hint="Failed inspection"
            />
            <StatTile
              label={isPurchase ? "Credit due" : "Refund"}
              value={money(doc.refundTotal, { cents: true })}
            />
          </StatStrip>
        </div>
      </RecordHeader>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-3">
        <div className="grid content-start gap-4 lg:col-span-2">
          <Section
            title="Returned lines"
            description="Condition decides what happens to each line. Only sellable units go back into stock."
            contentClassName="p-0"
          >
            <SimpleTable
              rows={doc.lines}
              getRowId={(l) => l.id}
              columns={[
                {
                  key: "product",
                  header: "Product",
                  cell: (l) => (
                    <Link href={`/inventory/products/${l.sku}`} className="grid gap-0.5 hover:underline">
                      <span className="font-medium">
                        {productById.get(l.productId)?.shortName ?? l.name}
                      </span>
                      <span className="text-code text-[11px] text-muted-foreground">{l.sku}</span>
                    </Link>
                  ),
                },
                { key: "qty", header: "Quantity", align: "right", cell: (l) => qty(l.quantity) },
                {
                  key: "condition",
                  header: "Condition",
                  cell: (l) => <StatusBadge status={l.condition} />,
                },
                {
                  key: "disposition",
                  header: "Disposition",
                  cell: (l) =>
                    l.restock ? (
                      <StatusBadge
                        label={isPurchase ? "Returns to supplier" : "Back to stock"}
                        tone="success"
                        showDot={false}
                      />
                    ) : (
                      <StatusBadge label="Scrapped" tone="danger" showDot={false} />
                    ),
                },
                {
                  key: "unitPrice",
                  header: "Unit price",
                  align: "right",
                  hideOnMobile: true,
                  cell: (l) => money(l.unitPrice, { cents: true }),
                },
                {
                  key: "refund",
                  header: isPurchase ? "Credit" : "Refund",
                  align: "right",
                  cell: (l) => (
                    <span className="font-medium">{money(l.refundAmount, { cents: true })}</span>
                  ),
                },
              ]}
              footer={
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="text-muted-foreground">
                    {plural(doc.lines.length, "line")} · {qty(units)} units
                  </span>
                  <span className="tabular" data-numeric>
                    <span className="text-muted-foreground">
                      {isPurchase ? "Credit due " : "Refund "}
                    </span>
                    <span className="font-semibold">
                      {money(doc.refundTotal, { cents: true })}
                    </span>
                  </span>
                </div>
              }
            />
          </Section>
        </div>

        <div className="grid content-start gap-4">
          <Section title="Details">
            <FieldGrid
              columns={2}
              fields={[
                { label: "Return", value: doc.number, mono: true },
                { label: "Type", value: isPurchase ? "Purchase return" : "Sales return" },
                {
                  label: isPurchase ? "Supplier" : "Customer",
                  value: (
                    <Link href={partnerHref} className="hover:underline">
                      {partner?.name}
                    </Link>
                  ),
                  span: 2,
                },
                {
                  label: "Against",
                  value: (
                    <Link href={sourceHref} className="text-code hover:underline">
                      {doc.sourceOrderNumber}
                    </Link>
                  ),
                },
                { label: "Warehouse", value: `${warehouse?.code} · ${warehouse?.name}` },
                { label: "Raised", value: date(doc.createdAt) },
                {
                  label: "Resolved",
                  value: doc.resolvedAt ? dateTime(doc.resolvedAt) : "Not resolved",
                },
                { label: "Raised by", value: userById.get(doc.createdBy)?.name ?? "—" },
                { label: "Reason", value: doc.reason, span: 2 },
              ]}
            />
          </Section>

          <Section title="Stock impact" description="What this return does to inventory.">
            <div className="grid gap-3">
              <StatTile
                label={isPurchase ? "Value leaving stock" : "Value returning to stock"}
                value={money(doc.restockValue)}
                tone={isPurchase ? "danger" : "success"}
                hint={`${qty(restockUnits)} sellable units`}
              />
              <StatTile
                label="Written off"
                value={qty(scrapUnits)}
                tone={scrapUnits > 0 ? "danger" : "neutral"}
                hint={
                  scrapUnits > 0
                    ? "Damaged, defective or expired — scrapped rather than restocked"
                    : "Everything passed inspection"
                }
              />
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-md border bg-surface-sunken p-3">
              <Undo2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-caption leading-relaxed text-muted-foreground">
                {isPurchase
                  ? "Units ship back to the supplier and leave stock at that point. The credit is tracked separately and often arrives weeks later."
                  : "Units are inspected on arrival. Only those graded sellable return to available stock; the rest are scrapped and written off."}
              </p>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
