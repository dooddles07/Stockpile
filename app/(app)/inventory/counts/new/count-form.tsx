"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section, StatTile } from "@/components/record/field-grid";
import { WorkflowStepper } from "@/components/status/workflow-stepper";
import { StatusBadge } from "@/components/status/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials, qty } from "@/lib/format";
import { humanize } from "@/lib/status";
import { cn } from "@/lib/utils";
import { scheduleCount } from "./actions";

export interface CountScope {
  warehouseId: string;
  zone: string;
  categoryId: string;
  categoryName: string;
  skuCount: number;
}

const TYPES = [
  {
    value: "cycle",
    hint: "A rolling slice of the catalogue, counted continuously without stopping the site.",
  },
  { value: "full", hint: "Everything at the site. Operations stop while it runs." },
  { value: "category", hint: "One product category across the whole site." },
  { value: "location", hint: "One zone, aisle or bin range." },
  { value: "spot", hint: "A handful of SKUs, usually to check a suspicion." },
];

/** Sheet-size caps for the two scoped-down count types — shared by the
 *  estimate shown here and the scope sent to `scheduleStockCount`, so the two
 *  cannot drift apart. */
const CYCLE_LIMIT = 40;
const SPOT_LIMIT = 12;

export function CountForm({
  warehouses,
  counters,
  scopes,
  categories,
}: {
  warehouses: { id: string; code: string; name: string }[];
  counters: { id: string; name: string; warehouseId: string | null }[];
  scopes: CountScope[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = React.useState(warehouses[0]?.id ?? "");
  const [type, setType] = React.useState("cycle");
  const [zone, setZone] = React.useState("A");
  const [categoryId, setCategoryId] = React.useState(categories[0]?.id ?? "");
  const [scheduledIn, setScheduledIn] = React.useState(1);
  const [assigned, setAssigned] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  const warehouseLabels = React.useMemo(
    () => Object.fromEntries(warehouses.map((w) => [w.id, `${w.code} · ${w.name}`])),
    [warehouses],
  );
  const typeLabels = React.useMemo(
    () => Object.fromEntries(TYPES.map((t) => [t.value, humanize(t.value)])),
    [],
  );
  const categoryLabels = React.useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const zones = React.useMemo(
    () => [...new Set(scopes.filter((s) => s.warehouseId === warehouseId).map((s) => s.zone))].sort(),
    [scopes, warehouseId],
  );
  const zoneLabels = React.useMemo(
    () => Object.fromEntries(zones.map((z) => [z, `Zone ${z}`])),
    [zones],
  );

  // A site may not have the zone that was picked at the previous site. Resolve
  // that during render rather than in an effect, which would cost an extra
  // render pass on every warehouse change.
  const activeZone = zones.includes(zone) ? zone : (zones[0] ?? "A");

  // Estimated line count, so the person scheduling knows whether they are
  // asking for an hour of work or a shutdown. A cycle or spot count is a
  // slice of the site rather than all of it, capped at the same size the
  // scheduling call below caps its scope to; the other three types take
  // everything their scope resolves to.
  const siteScopes = scopes.filter((s) => s.warehouseId === warehouseId);
  const estimatedLines =
    type === "full"
      ? siteScopes.reduce((s, x) => s + x.skuCount, 0)
      : type === "category"
        ? siteScopes.filter((s) => s.categoryId === categoryId).reduce((s, x) => s + x.skuCount, 0)
        : type === "location"
          ? siteScopes.filter((s) => s.zone === activeZone).reduce((s, x) => s + x.skuCount, 0)
          : type === "cycle"
            ? Math.min(CYCLE_LIMIT, siteScopes.reduce((s, x) => s + x.skuCount, 0))
            : SPOT_LIMIT;

  // Roughly 25 lines an hour for a two-handed count with a scanner.
  const estimatedHours = Math.max(0.5, Math.round((estimatedLines / 25) * 2) / 2);
  const perCounter = assigned.length > 0 ? estimatedHours / assigned.length : estimatedHours;

  const siteCounters = counters.filter(
    (c) => c.warehouseId === warehouseId || c.warehouseId === null,
  );
  const canSubmit = assigned.length > 0 && estimatedLines > 0;

  const lineLimit = type === "cycle" ? CYCLE_LIMIT : type === "spot" ? SPOT_LIMIT : null;

  const scopeLabel =
    type === "full"
      ? "All zones"
      : type === "category"
        ? (categories.find((c) => c.id === categoryId)?.name ?? "—")
        : type === "location"
          ? `Zone ${activeZone}`
          : `${estimatedLines} SKUs`;

  const schedule = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);

    const result = await scheduleCount({
      warehouseId,
      type,
      zone: type === "location" ? activeZone : null,
      categoryId: type === "category" ? categoryId : null,
      limit: lineLimit,
      scheduledInDays: scheduledIn,
      assignedTo: assigned,
      scopeLabel,
    });

    if (!result.ok) {
      setSaving(false);
      toast.error("Count not scheduled", { description: result.message });
      return;
    }

    toast.success(`${result.number} scheduled`, {
      description: `${qty(result.lines)} lines at ${warehouses.find((w) => w.id === warehouseId)?.code}, assigned to ${assigned.length} counter${assigned.length === 1 ? "" : "s"}.`,
    });
    router.push(`/inventory/counts/${result.id}`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section title="What to count" description="Scope decides how long the count takes and who it disrupts.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="warehouse">Warehouse</Label>
              <Select items={warehouseLabels} value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? "")}>
                <SelectTrigger id="warehouse">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.code} · {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="type">Count type</Label>
              <Select items={typeLabels} value={type} onValueChange={(v) => setType(v ?? "cycle")}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {humanize(t.value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">
                {TYPES.find((t) => t.value === type)?.hint}
              </p>
            </div>

            {type === "category" && (
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select items={categoryLabels} value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {type === "location" && (
              <div className="grid gap-2">
                <Label htmlFor="zone">Zone</Label>
                <Select items={zoneLabels} value={activeZone} onValueChange={(v) => setZone(v ?? "A")}>
                  <SelectTrigger id="zone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => (
                      <SelectItem key={z} value={z}>
                        Zone {z}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="scheduled">Schedule in (days)</Label>
              <Input
                id="scheduled"
                type="number"
                min={0}
                max={90}
                inputMode="numeric"
                value={scheduledIn}
                onChange={(e) => setScheduledIn(Math.max(0, Number(e.target.value) || 0))}
                className="text-right tabular"
              />
              <p className="text-caption text-muted-foreground">
                {scheduledIn === 0 ? "Starts today." : `Starts in ${scheduledIn} day${scheduledIn === 1 ? "" : "s"}.`}
              </p>
            </div>
          </div>

          {type === "full" && (
            <div className="mt-4 rounded-md border border-status-warning-border bg-status-warning-bg p-3">
              <p className="text-[13px] font-medium text-status-warning">
                A full count stops the site
              </p>
              <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
                Receiving, picking and despatch are frozen while a full count runs so nothing moves
                mid-count. Roughly {estimatedHours} hours of counting across{" "}
                {qty(estimatedLines)} lines — schedule it outside operating hours if you can.
              </p>
            </div>
          )}
        </Section>

        <Section
          title="Who is counting"
          description="Assign at least one counter. Work is split evenly across whoever is assigned."
          actions={<Users className="size-4 text-muted-foreground" aria-hidden />}
        >
          {siteCounters.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              No warehouse staff are assigned to this site.
            </p>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {siteCounters.map((c) => {
                const checked = assigned.includes(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 transition-colors",
                        checked ? "border-primary bg-accent" : "hover:bg-surface-hover",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setAssigned((a) =>
                            v ? [...a, c.id] : a.filter((x) => x !== c.id),
                          )
                        }
                        aria-label={`Assign ${c.name}`}
                      />
                      <Avatar className="size-7">
                        <AvatarFallback className="bg-surface-sunken text-[10px] font-semibold text-muted-foreground">
                          {initials(c.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 truncate text-[13px] font-medium">{c.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid content-start gap-4">
        <Section title="Estimate" description="What you are scheduling.">
          <div className="grid gap-3">
            <StatTile label="Lines to count" value={qty(estimatedLines)} hint={scopeLabel} />
            <StatTile
              label="Estimated effort"
              value={`${estimatedHours}h`}
              hint="At roughly 25 lines an hour"
            />
            <StatTile
              label="Per counter"
              value={assigned.length > 0 ? `${Math.round(perCounter * 2) / 2}h` : "—"}
              tone={assigned.length === 0 ? "warning" : "neutral"}
              hint={
                assigned.length === 0
                  ? "Assign at least one counter"
                  : `Split across ${assigned.length} counter${assigned.length === 1 ? "" : "s"}`
              }
            />
          </div>

          <div className="mt-4">
            <WorkflowStepper workflow="count" status="scheduled" />
          </div>
        </Section>

        <div className="rounded-lg border p-3">
          <p className="text-caption text-muted-foreground">What happens next</p>
          <ol className="mt-2 grid gap-1.5 text-caption">
            <li className="flex items-start gap-2">
              <StatusBadge label="1" tone="neutral" showDot={false} />
              <span>Counters see the sheet with expected quantities hidden.</span>
            </li>
            <li className="flex items-start gap-2">
              <StatusBadge label="2" tone="info" showDot={false} />
              <span>Variances beyond ±8 units are recounted before submission.</span>
            </li>
            <li className="flex items-start gap-2">
              <StatusBadge label="3" tone="warning" showDot={false} />
              <span>An inventory manager reviews and approves the remaining variances.</span>
            </li>
            <li className="flex items-start gap-2">
              <StatusBadge label="4" tone="success" showDot={false} />
              <span>Approved variances post to the ledger as adjustments.</span>
            </li>
          </ol>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-8"
            disabled={!canSubmit || saving}
            onClick={schedule}
          >
            <CalendarClock className="size-3.5" aria-hidden />
            {saving ? "Scheduling..." : "Schedule count"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => router.push("/inventory/counts")}
          >
            Cancel
          </Button>
        </div>

        {assigned.length === 0 && (
          <p className="flex items-start gap-1.5 text-caption text-muted-foreground">
            <Check className="mt-0.5 size-3 shrink-0" aria-hidden />
            Assign at least one counter before scheduling.
          </p>
        )}
      </div>
    </div>
  );
}
