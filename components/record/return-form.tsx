"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, TriangleAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section, StatTile } from "@/components/record/field-grid";
import { EmptyState } from "@/components/states";
import { money, plural, qty } from "@/lib/format";
import type { ItemCondition, ReturnKind } from "@/lib/types";
import { raiseReturnAction } from "@/app/(app)/purchasing/returns/new/actions";

export interface ReturnableLine {
  /** The source document's own line id — what the domain matches the return
   *  line back to, to copy its SKU, name and price. */
  id: string;
  sku: string;
  name: string;
  /** What actually moved on the source document — the ceiling for a return. */
  shipped: number;
  unitPrice: number;
}

export interface ReturnableOrder {
  id: string;
  number: string;
  partner: string;
  siteCode: string;
  dated: string;
  lines: ReturnableLine[];
}

const CONDITIONS: Record<ItemCondition, string> = {
  sellable: "Sellable",
  damaged: "Damaged",
  defective: "Defective",
  expired: "Expired",
};

/** Only sellable stock goes back on the shelf; the rest is a write-off. */
const RESTOCKABLE: ItemCondition[] = ["sellable"];

interface LineState {
  quantity: number;
  condition: ItemCondition;
  restock: boolean;
}

/**
 * A return is always against something that already shipped, so the form starts
 * from the source document rather than a blank product picker: it is the only
 * way the quantities can be checked against what actually left the building.
 */
export function ReturnForm({
  kind,
  orders,
  reasons,
  preselectedOrderId,
}: {
  kind: ReturnKind;
  orders: ReturnableOrder[];
  reasons: string[];
  preselectedOrderId?: string;
}) {
  const router = useRouter();
  const sales = kind === "sales";
  const listHref = sales ? "/sales/returns" : "/purchasing/returns";

  const [orderId, setOrderId] = React.useState(
    () => preselectedOrderId ?? orders[0]?.id ?? "",
  );
  const [reason, setReason] = React.useState(reasons[0]);
  const [note, setNote] = React.useState("");
  const [lines, setLines] = React.useState<Record<string, LineState>>({});
  const [submitted, setSubmitted] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const order = orders.find((o) => o.id === orderId);

  const stateFor = (line: ReturnableLine): LineState =>
    lines[line.id] ?? { quantity: 0, condition: "sellable", restock: true };

  const update = (line: ReturnableLine, patch: Partial<LineState>) =>
    setLines((prev) => {
      const current = prev[line.id] ?? { quantity: 0, condition: "sellable", restock: true };
      const next = { ...current, ...patch };
      // Condition drives restock, not the other way round: a defective unit put
      // back on the shelf is the bug that sells the fault to the next customer.
      if (patch.condition !== undefined && !RESTOCKABLE.includes(patch.condition)) {
        next.restock = false;
      }
      return { ...prev, [line.id]: next };
    });

  const picked = (order?.lines ?? [])
    .map((line) => ({ line, state: stateFor(line) }))
    .filter(({ state }) => state.quantity > 0);

  const units = picked.reduce((sum, { state }) => sum + state.quantity, 0);
  const refund = picked.reduce((sum, { line, state }) => sum + state.quantity * line.unitPrice, 0);
  const restockValue = picked.reduce(
    (sum, { line, state }) => sum + (state.restock ? state.quantity * line.unitPrice : 0),
    0,
  );
  const writeOff = refund - restockValue;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!order || picked.length === 0 || saving) return;

    setSaving(true);
    let result;
    try {
      result = await raiseReturnAction({
        kind,
        sourceOrderId: order.id,
        reason,
        note,
        lines: picked.map(({ line, state }) => ({
          lineId: line.id,
          quantity: state.quantity,
          condition: state.condition,
          restock: state.restock,
        })),
      });
    } catch (error) {
      setSaving(false);
      toast.error("Return not raised", {
        description: "Something went wrong raising the return. Try again.",
      });
      throw error;
    }

    if (!result.ok) {
      setSaving(false);
      toast.error("Return not raised", { description: result.message });
      return;
    }

    toast.success(`${result.number} raised against ${order.number}`, {
      description: `${plural(picked.length, "line")}, ${qty(units)} units, ${money(refund)} ${
        sales ? "to credit" : "to claim from the supplier"
      }. ${
        writeOff > 0
          ? `${money(writeOff)} of it is not going back on the shelf.`
          : "All of it is sellable and goes back into stock."
      }`,
    });
    router.push(`${listHref}/${result.id}`);
  };

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Undo2}
        title={sales ? "Nothing has shipped yet" : "Nothing has been received yet"}
        description={
          sales
            ? "A return needs a shipped sales order behind it. Once an order leaves the building it becomes available here."
            : "A purchase return needs goods that have actually been received. Book a delivery in first."
        }
        className="py-14"
        action={
          <Button size="sm" className="h-8" onClick={() => router.push(listHref)}>
            Back to returns
          </Button>
        }
      />
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <Section
        title="Source document"
        description={
          sales
            ? "The order the goods went out on. Quantities cannot exceed what shipped."
            : "The order the goods arrived on. Quantities cannot exceed what was received."
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="order">{sales ? "Sales order" : "Purchase order"}</FieldLabel>
            <Select
              items={Object.fromEntries(
                orders.map((o) => [o.id, `${o.number} · ${o.partner}`]),
              )}
              value={orderId}
              onValueChange={(value) => {
                setOrderId(value ?? orderId);
                setLines({});
              }}
            >
              <SelectTrigger id="order">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {orders.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.number} · {o.partner}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {order && (
              <FieldDescription>
                {order.dated} · {order.siteCode} · {plural(order.lines.length, "line")}
              </FieldDescription>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="reason">Reason</FieldLabel>
            <Select
              items={Object.fromEntries(reasons.map((r) => [r, r]))}
              value={reason}
              onValueChange={(value) => setReason(value ?? reason)}
            >
              <SelectTrigger id="reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {sales
                ? "Reported reasons drive the quality figures on the product page."
                : "Reported reasons drive the defect rate on the supplier scorecard."}
            </FieldDescription>
          </Field>
        </div>
      </Section>

      <Section
        title="Lines"
        description="Leave a line at zero if none of it is coming back."
      >
        <ul className="grid gap-2">
          {(order?.lines ?? []).map((line) => {
            const state = stateFor(line);
            const over = state.quantity > line.shipped;
            return (
              <li key={line.id} className="rounded-lg border bg-surface p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-card-title font-medium leading-snug">{line.name}</p>
                    <p className="mt-0.5 text-caption text-muted-foreground">
                      <span className="text-code">{line.sku}</span> · {qty(line.shipped)}{" "}
                      {sales ? "shipped" : "received"} at {money(line.unitPrice, { cents: true })}
                    </p>
                  </div>
                  <p className="tabular text-card-title font-medium">
                    {money(state.quantity * line.unitPrice)}
                  </p>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field>
                    <FieldLabel htmlFor={`qty-${line.id}`}>Quantity back</FieldLabel>
                    <Input
                      id={`qty-${line.id}`}
                      type="number"
                      min={0}
                      max={line.shipped}
                      className="tabular"
                      value={state.quantity}
                      onChange={(e) =>
                        update(line, { quantity: Math.max(0, Number(e.target.value) || 0) })
                      }
                      aria-invalid={over}
                    />
                    {over && (
                      <FieldDescription className="text-status-danger">
                        Only {qty(line.shipped)} {sales ? "shipped" : "arrived"} on this line.
                      </FieldDescription>
                    )}
                  </Field>

                  <Field>
                    <FieldLabel htmlFor={`cond-${line.id}`}>Condition</FieldLabel>
                    <Select
                      items={CONDITIONS}
                      value={state.condition}
                      onValueChange={(value) =>
                        update(line, { condition: (value ?? state.condition) as ItemCondition })
                      }
                    >
                      <SelectTrigger id={`cond-${line.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CONDITIONS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor={`restock-${line.id}`}>Back into stock</FieldLabel>
                    <label className="flex h-8 items-center gap-2 text-body">
                      <Checkbox
                        id={`restock-${line.id}`}
                        checked={state.restock}
                        onCheckedChange={(checked) => update(line, { restock: checked === true })}
                        disabled={!RESTOCKABLE.includes(state.condition)}
                      />
                      <span className="text-caption text-muted-foreground">
                        {RESTOCKABLE.includes(state.condition)
                          ? "Returns to its bin as available stock"
                          : "Written off — quarantined, not resold"}
                      </span>
                    </label>
                  </Field>
                </div>
              </li>
            );
          })}
        </ul>

        {submitted && picked.length === 0 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-2.5 text-caption text-status-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>Put a quantity against at least one line — a return with nothing on it credits nothing.</p>
          </div>
        )}
      </Section>

      <Section title="Effect" description="What this does to stock and to the ledger.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Lines" value={String(picked.length)} />
          <StatTile label="Units back" value={qty(units)} />
          <StatTile
            label={sales ? "To credit" : "To claim"}
            value={money(refund)}
            tone={refund > 0 ? "info" : undefined}
          />
          <StatTile
            label="Written off"
            value={money(writeOff)}
            tone={writeOff > 0 ? "warning" : undefined}
          />
        </div>

        <div className="mt-4 grid gap-2">
          <FieldLabel htmlFor="note">Note</FieldLabel>
          <Textarea
            id="note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              sales
                ? "e.g. Customer photographed the damage on arrival; carrier claim raised."
                : "e.g. Two pallets failed goods-in inspection; supplier notified by phone."
            }
          />
          <p className="text-caption text-muted-foreground">
            Goes on the return and into the audit trail. It is what the person handling the credit
            reads first.
          </p>
        </div>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="h-8" disabled={saving}>
          <Save className="size-3.5" aria-hidden />
          {saving ? "Raising..." : "Raise return"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => router.push(listHref)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
