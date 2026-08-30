"use client";

import * as React from "react";
import { Check, ScanLine } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section, StatTile } from "@/components/record/field-grid";
import { StatusBadge } from "@/components/status/status-badge";
import { MeterBar } from "@/components/status/meter-bar";
import { percent, plural, qty, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { submitCountAction, type CountFormState } from "./actions";

const INITIAL: CountFormState = { status: "idle" };

export interface CountSheetLine {
  id: string;
  sku: string;
  name: string;
  locationCode: string;
  expected: number;
  counted: number | null;
  unitCost: number;
}

/** Variance beyond this is recounted before anything is posted. */
const TOLERANCE = 8;

/**
 * The counting sheet.
 *
 * Expected quantities are deliberately hidden until a line is counted. Showing
 * the system figure next to an empty box is how you get a count that agrees
 * with the system rather than with the shelf.
 */
export function CountSheet({
  stockCountId,
  lines,
}: {
  stockCountId: string;
  lines: CountSheetLine[];
}) {
  const [state, formAction, pending] = React.useActionState(submitCountAction, INITIAL);

  const seen = React.useRef<CountFormState>(INITIAL);
  React.useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.status === "success") toast.success(state.message);
    else if (state.status === "error") toast.error(state.message);
  }, [state]);

  const [entries, setEntries] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, l.counted === null ? "" : String(l.counted)])),
  );
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, l.counted !== null])),
  );

  const resolved = lines.map((line) => {
    const raw = entries[line.id];
    const counted = raw === "" || raw === undefined ? null : Math.max(0, Number(raw) || 0);
    const variance = counted === null ? 0 : counted - line.expected;
    return {
      line,
      counted,
      variance,
      varianceValue: variance * line.unitCost,
      needsRecount: Math.abs(variance) > TOLERANCE,
      shown: revealed[line.id] ?? false,
    };
  });

  const done = resolved.filter((r) => r.counted !== null);
  const variances = done.filter((r) => r.variance !== 0);
  const recounts = done.filter((r) => r.needsRecount);
  const accuracy = done.length > 0 ? (done.length - variances.length) / done.length : 0;
  const progress = lines.length > 0 ? done.length / lines.length : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section
          title="Count sheet"
          description="Enter what is physically on the shelf. The expected quantity stays hidden until you have committed to a number."
          contentClassName="p-0"
        >
          <ul className="divide-y">
            {resolved.map(({ line, counted, variance, needsRecount, shown }) => (
              <li key={line.id} className="grid gap-2 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[13px] font-medium">{line.name}</span>
                    <span className="text-code text-[11px] text-muted-foreground">
                      {line.sku} · bin {line.locationCode}
                    </span>
                  </span>

                  <div className="flex items-end gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor={`count-${line.id}`} className="text-caption text-muted-foreground">
                        Counted
                      </Label>
                      <Input
                        id={`count-${line.id}`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder="—"
                        value={entries[line.id] ?? ""}
                        onChange={(e) => setEntries((s) => ({ ...s, [line.id]: e.target.value }))}
                        onBlur={() => {
                          if ((entries[line.id] ?? "") !== "") {
                            setRevealed((s) => ({ ...s, [line.id]: true }));
                          }
                        }}
                        className={cn(
                          "h-8 w-28 text-right tabular",
                          needsRecount && shown && "border-status-danger",
                          variance !== 0 && !needsRecount && shown && "border-status-warning",
                        )}
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <span className="text-caption text-muted-foreground">Expected</span>
                      <output
                        className={cn(
                          "flex h-8 w-24 items-center justify-end rounded-md border bg-surface-sunken px-3 text-[13px] tabular",
                          !shown && "text-muted-foreground",
                        )}
                      >
                        {shown ? qty(line.expected) : "hidden"}
                      </output>
                    </div>

                    <div className="grid gap-1.5">
                      <span className="text-caption text-muted-foreground">Variance</span>
                      <output
                        className={cn(
                          "flex h-8 w-24 items-center justify-end rounded-md border px-3 text-[13px] font-semibold tabular",
                          !shown || counted === null
                            ? "bg-surface-sunken text-muted-foreground"
                            : variance === 0
                              ? "border-status-success-border bg-status-success-bg text-status-success"
                              : variance > 0
                                ? "border-status-purple-border bg-status-purple-bg text-status-purple"
                                : "border-status-danger-border bg-status-danger-bg text-status-danger",
                        )}
                      >
                        {shown && counted !== null ? signed(variance) : "—"}
                      </output>
                    </div>
                  </div>
                </div>

                {shown && counted !== null && needsRecount && (
                  <StatusBadge
                    label={`Outside tolerance (±${TOLERANCE}) — recount required`}
                    tone="danger"
                  />
                )}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="grid content-start gap-4">
        <Section title="Progress" description="Where this count has got to.">
          <div className="grid gap-4">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-caption text-muted-foreground">Lines counted</span>
                <span className="tabular text-[15px] font-bold" data-numeric>
                  {qty(done.length)} / {qty(lines.length)}
                </span>
              </div>
              <MeterBar
                value={progress}
                tone={progress === 1 ? "success" : "info"}
                className="mt-2"
                label={`${done.length} of ${plural(lines.length, "line")} counted`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatTile
                label="Accuracy"
                value={done.length > 0 ? percent(accuracy, 1) : "—"}
                tone={accuracy >= 0.99 ? "success" : accuracy >= 0.97 ? "warning" : "danger"}
              />
              <StatTile
                label="Variances"
                value={qty(variances.length)}
                tone={variances.length > 0 ? "warning" : "success"}
              />
            </div>

            {recounts.length > 0 && (
              <div className="rounded-md border border-status-danger-border bg-status-danger-bg p-3">
                <p className="text-[13px] font-medium text-status-danger">
                  {plural(recounts.length, "line")} need a recount
                </p>
                <p className="mt-1 text-caption leading-relaxed text-status-danger/90">
                  Variance beyond ±{TOLERANCE} units is more likely a miscount than a real
                  discrepancy. These are recounted before the count can be submitted for review.
                </p>
              </div>
            )}
          </div>
        </Section>

        <div className="flex flex-wrap gap-2">
          <form action={formAction} className="contents">
            <input type="hidden" name="intent" value="complete" />
            <input type="hidden" name="stockCountId" value={stockCountId} />
            <input
              type="hidden"
              name="lines"
              value={JSON.stringify(
                done.map((r) => ({ lineId: r.line.id, counted: r.counted })),
              )}
            />
            <Button
              type="submit"
              size="sm"
              className="h-8"
              disabled={pending || done.length < lines.length || recounts.length > 0}
            >
              <Check className="size-3.5" aria-hidden />
              {pending ? "Completing…" : "Complete count"}
            </Button>
          </form>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() =>
              toast.info("Scanner session started", {
                description: "Scan a barcode to jump to that line and enter a quantity.",
              })
            }
          >
            <ScanLine className="size-3.5" aria-hidden />
            Scan mode
          </Button>
        </div>

        {done.length < lines.length && (
          <p className="text-caption text-muted-foreground">
            {plural(lines.length - done.length, "line")} still to count before this can be submitted.
          </p>
        )}
      </div>
    </div>
  );
}
