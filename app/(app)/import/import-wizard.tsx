"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileSpreadsheet,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Section, StatTile } from "@/components/record/field-grid";
import { StatusBadge } from "@/components/status/status-badge";
import { MeterBar } from "@/components/status/meter-bar";
import { EmptyState } from "@/components/states";
import {
  IMPORT_SCHEMAS,
  autoMap,
  parseDelimited,
  validateRows,
  type ImportKind,
  type RowIssue,
  type ValidationResult,
} from "@/lib/import/validate";
import { percent, plural, qty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { runImport as submitImportRows } from "./actions";

type Step = "upload" | "map" | "review" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Map columns" },
  { id: "review", label: "Review" },
  { id: "done", label: "Summary" },
];

const UNMAPPED = "__none__";

export function ImportWizard({
  kinds,
  existingKeys,
}: {
  kinds: ImportKind[];
  existingKeys: Record<string, string[]>;
}) {
  const router = useRouter();
  const [kind, setKind] = React.useState<ImportKind>(kinds[0]);
  const [step, setStep] = React.useState<Step>("upload");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [dragging, setDragging] = React.useState(false);
  const [imported, setImported] = React.useState<ValidationResult | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const schema = IMPORT_SCHEMAS[kind];
  const keySet = React.useMemo(
    () => new Set((existingKeys[kind] ?? []).map((k) => k.toUpperCase())),
    [existingKeys, kind],
  );

  const kindLabels = React.useMemo(
    () => Object.fromEntries(kinds.map((k) => [k, IMPORT_SCHEMAS[k].label])),
    [kinds],
  );

  const columnOptions = React.useMemo(
    () => ({
      [UNMAPPED]: "Not mapped",
      ...Object.fromEntries(headers.map((h) => [h, h])),
    }),
    [headers],
  );

  const result = React.useMemo(
    () => (headers.length > 0 ? validateRows(headers, rows, mapping, schema, keySet) : null),
    [headers, rows, mapping, schema, keySet],
  );

  const errors = result?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = result?.issues.filter((i) => i.severity === "warning") ?? [];
  const errorRows = new Set(errors.map((e) => e.row));
  const cleanCount = result ? result.total - errorRows.size : 0;

  const readFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseDelimited(text);
    if (parsed.headers.length === 0) {
      toast.error("That file has no header row", {
        description: "The first line must name the columns.",
      });
      return;
    }
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(autoMap(parsed.headers, schema));
    setStep("map");
    toast.success(`${file.name} read`, {
      description: `${plural(parsed.rows.length, "row")} found. Columns were matched automatically where the names lined up.`,
    });
  };

  const downloadTemplate = () => {
    const csv = schema.sample.map((line) => line.join(",")).join("\r\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stockpile-${kind}-template.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep("upload");
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setImported(null);
  };

  const runImport = async () => {
    if (!result || result.valid.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const res = await submitImportRows({ kind, rows: result.valid });
      if (!res.ok) {
        toast.error("Nothing was imported", {
          description: `${res.message} The file is one transaction — no rows were written.`,
        });
        return;
      }
      setImported(result);
      setStep("done");
      toast.success(`${plural(res.imported, "row")} imported`, {
        description:
          errorRows.size > 0
            ? `${plural(errorRows.size, "row")} were skipped because they had errors. Nothing from those rows was written.`
            : "Every row passed validation.",
      });
    } catch {
      toast.error("The import did not complete", {
        description: "Something went wrong before anything was written. Try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const requiredUnmapped = schema.fields.filter(
    (f) => f.required && (!mapping[f.key] || mapping[f.key] === UNMAPPED),
  );

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="grid gap-4">
      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {STEPS.map((s, i) => {
          const done = i < stepIndex;
          const current = i === stepIndex;
          return (
            <li key={s.id} className="flex items-center gap-1">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium",
                  done && "text-status-success",
                  current && "bg-primary text-primary-foreground",
                  !done && !current && "text-muted-foreground",
                )}
                aria-current={current ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none",
                    done && "border-status-success bg-status-success text-white",
                    current && "border-primary-foreground/70 bg-primary-foreground/15",
                    !done && !current && "border-border-strong",
                  )}
                  aria-hidden
                >
                  {done ? <Check className="size-2.5" strokeWidth={3} /> : i + 1}
                </span>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span className={cn("h-px w-4", done ? "bg-status-success" : "bg-border")} aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      {/* ---------------------------------------------------------- upload -- */}
      {step === "upload" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid content-start gap-4 lg:col-span-2">
            <Section title="What are you importing?" description="The type decides which columns are expected.">
              <div className="grid gap-2 sm:max-w-sm">
                <Label htmlFor="import-kind">Record type</Label>
                <Select
                  items={kindLabels}
                  value={kind}
                  onValueChange={(v) => setKind((v as ImportKind) ?? kinds[0])}
                >
                  <SelectTrigger id="import-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {kinds.map((k) => (
                      <SelectItem key={k} value={k}>
                        {IMPORT_SCHEMAS[k].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-caption leading-relaxed text-muted-foreground">
                  {schema.description}
                </p>
              </div>
            </Section>

            <Section
              title="Upload a file"
              description="CSV or tab-separated. The first row must name the columns."
              actions={
                <Button variant="outline" size="sm" className="h-7" onClick={downloadTemplate}>
                  <Download className="size-3.5" aria-hidden />
                  Template
                </Button>
              }
            >
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void readFile(file);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors",
                  dragging ? "border-primary bg-accent" : "hover:border-border-strong hover:bg-surface-hover",
                )}
              >
                <span className="mb-3 flex size-11 items-center justify-center rounded-lg border bg-surface-sunken">
                  <Upload className="size-5 text-muted-foreground" aria-hidden />
                </span>
                <span className="text-[13px] font-medium">
                  Drop a file here, or click to choose one
                </span>
                <span className="mt-1 text-caption text-muted-foreground">
                  Nothing is written until you have seen the validation result.
                </span>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void readFile(file);
                  }}
                />
              </label>
            </Section>
          </div>

          <Section title="Expected columns" description={`For ${schema.label.toLowerCase()}.`} contentClassName="p-0">
            <ul className="divide-y">
              {schema.fields.map((field) => (
                <li key={field.key} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">{field.label}</span>
                    {field.required ? (
                      <StatusBadge label="Required" tone="danger" showDot={false} />
                    ) : (
                      <StatusBadge label="Optional" tone="neutral" showDot={false} />
                    )}
                  </div>
                  <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">
                    {field.hint}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {/* ------------------------------------------------------------- map -- */}
      {step === "map" && result && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid content-start gap-4 lg:col-span-2">
            <Section
              title="Map your columns"
              description="Matched automatically where the names lined up. Check anything left unmapped."
              actions={
                <span className="flex items-center gap-2 text-caption text-muted-foreground">
                  <FileSpreadsheet className="size-3.5" aria-hidden />
                  {fileName}
                </span>
              }
              contentClassName="p-0"
            >
              <ul className="divide-y">
                {schema.fields.map((field) => {
                  const current = mapping[field.key] ?? UNMAPPED;
                  const missing = field.required && current === UNMAPPED;
                  const sampleValue =
                    current !== UNMAPPED && rows[0]
                      ? (rows[0][headers.indexOf(current)] ?? "")
                      : "";

                  return (
                    <li
                      key={field.key}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium">{field.label}</span>
                          {field.required && (
                            <StatusBadge label="Required" tone="danger" showDot={false} />
                          )}
                        </div>
                        <p className="mt-0.5 text-caption text-muted-foreground">{field.hint}</p>
                        {sampleValue && (
                          <p className="text-code mt-1 truncate text-[11px] text-muted-foreground">
                            first row: {sampleValue}
                          </p>
                        )}
                      </div>

                      <Select
                        items={columnOptions}
                        value={current}
                        onValueChange={(v) =>
                          setMapping((m) => {
                            const next = { ...m };
                            if (!v || v === UNMAPPED) delete next[field.key];
                            else next[field.key] = v;
                            return next;
                          })
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className={cn("h-8 w-56 text-[13px]", missing && "border-destructive")}
                          aria-label={`Column for ${field.label}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNMAPPED}>Not mapped</SelectItem>
                          {headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </li>
                  );
                })}
              </ul>
            </Section>
          </div>

          <div className="grid content-start gap-4">
            <Section title="File" description="What was read from the upload.">
              <div className="grid gap-3">
                <StatTile label="Rows" value={qty(result.total)} />
                <StatTile label="Columns" value={qty(headers.length)} />
                <StatTile
                  label="Mapped fields"
                  value={`${qty(Object.keys(mapping).length)} / ${qty(schema.fields.length)}`}
                  tone={requiredUnmapped.length > 0 ? "warning" : "success"}
                />
              </div>
            </Section>

            {requiredUnmapped.length > 0 && (
              <div className="rounded-lg border border-status-danger-border bg-status-danger-bg p-3">
                <p className="text-[13px] font-medium text-status-danger">
                  {plural(requiredUnmapped.length, "required field")} not mapped
                </p>
                <p className="mt-1 text-caption leading-relaxed text-status-danger/90">
                  {requiredUnmapped.map((f) => f.label).join(", ")} must be mapped to a column
                  before this file can be validated.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="h-8"
                disabled={requiredUnmapped.length > 0}
                onClick={() => setStep("review")}
              >
                Validate
                <ArrowRight className="size-3.5" aria-hidden />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={reset}>
                <ArrowLeft className="size-3.5" aria-hidden />
                Start over
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- review -- */}
      {step === "review" && result && (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Rows in file" value={qty(result.total)} />
            <StatTile
              label="Will import"
              value={qty(cleanCount)}
              tone={cleanCount > 0 ? "success" : "danger"}
              hint={result.total > 0 ? percent(cleanCount / result.total, 0) : undefined}
            />
            <StatTile
              label="Will be skipped"
              value={qty(errorRows.size)}
              tone={errorRows.size > 0 ? "danger" : "success"}
              hint={errorRows.size > 0 ? "Nothing from these rows is written" : "No errors"}
            />
            <StatTile
              label="Warnings"
              value={qty(warnings.length)}
              tone={warnings.length > 0 ? "warning" : "neutral"}
              hint="Imported, but worth a look"
            />
          </div>

          {errors.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-status-danger-border bg-status-danger-bg p-4">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-danger" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-status-danger">
                  {plural(errors.length, "error")} across {plural(errorRows.size, "row")}
                </p>
                <p className="mt-1 text-caption leading-relaxed text-status-danger/90">
                  Those rows are skipped entirely — no partial records are created. Fix the file and
                  upload again, or import the {qty(cleanCount)} clean rows now and deal with the
                  rest separately.
                </p>
              </div>
            </div>
          )}

          <Section
            title="Validation results"
            description="Every problem found, with the row number and the value that caused it."
            contentClassName="p-0"
          >
            {result.issues.length === 0 ? (
              <EmptyState
                icon={Check}
                title="Every row passed"
                description={`All ${qty(result.total)} rows are valid and ready to import.`}
                className="py-12"
              />
            ) : (
              <div className="max-h-96 overflow-auto">
                <Table className="text-table">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-20 bg-surface-sunken px-3 text-[11px] font-semibold uppercase text-muted-foreground">
                        Row
                      </TableHead>
                      <TableHead className="w-24 bg-surface-sunken px-3 text-[11px] font-semibold uppercase text-muted-foreground">
                        Severity
                      </TableHead>
                      <TableHead className="w-40 bg-surface-sunken px-3 text-[11px] font-semibold uppercase text-muted-foreground">
                        Field
                      </TableHead>
                      <TableHead className="bg-surface-sunken px-3 text-[11px] font-semibold uppercase text-muted-foreground">
                        Problem
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.issues.slice(0, 200).map((issue: RowIssue, i) => (
                      <TableRow key={i} className="border-b">
                        <TableCell className="px-3 py-1.5 tabular text-muted-foreground" data-numeric>
                          {issue.row}
                        </TableCell>
                        <TableCell className="px-3 py-1.5">
                          <StatusBadge
                            label={issue.severity === "error" ? "Error" : "Warning"}
                            tone={issue.severity === "error" ? "danger" : "warning"}
                          />
                        </TableCell>
                        <TableCell className="px-3 py-1.5 text-muted-foreground">
                          {issue.fieldLabel}
                        </TableCell>
                        <TableCell className="px-3 py-1.5">{issue.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {result.issues.length > 200 && (
                  <p className="border-t bg-surface-sunken px-3 py-2 text-caption text-muted-foreground">
                    Showing the first 200 of {qty(result.issues.length)} issues.
                  </p>
                )}
              </div>
            )}
          </Section>

          {result.valid.length > 0 && (
            <Section
              title="Preview"
              description={`The first rows exactly as they will be imported.`}
              contentClassName="p-0"
            >
              <div className="overflow-x-auto">
                <Table className="text-table">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {schema.fields.map((f) => (
                        <TableHead
                          key={f.key}
                          className="whitespace-nowrap bg-surface-sunken px-3 text-[11px] font-semibold uppercase text-muted-foreground"
                        >
                          {f.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.valid.slice(0, 8).map((row, i) => (
                      <TableRow key={i} className="border-b">
                        {schema.fields.map((f) => (
                          <TableCell key={f.key} className="whitespace-nowrap px-3 py-1.5">
                            {row[f.key]?.trim() ? (
                              row[f.key]
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Section>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-8"
              disabled={cleanCount === 0 || submitting}
              onClick={() => void runImport()}
            >
              <Check className="size-3.5" aria-hidden />
              {submitting
                ? "Importing…"
                : `Import ${qty(cleanCount)} ${cleanCount === 1 ? "row" : "rows"}`}
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setStep("map")}>
              <ArrowLeft className="size-3.5" aria-hidden />
              Back to mapping
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={reset}>
              <X className="size-3.5" aria-hidden />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ done -- */}
      {step === "done" && imported && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid content-start gap-4 lg:col-span-2">
            <Section title="Import complete" description={`${schema.label} from ${fileName}.`}>
              <div className="grid gap-4">
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-caption text-muted-foreground">Rows imported</span>
                    <span className="tabular text-[15px] font-bold" data-numeric>
                      {qty(imported.valid.length)} / {qty(imported.total)}
                    </span>
                  </div>
                  <MeterBar
                    value={imported.total > 0 ? imported.valid.length / imported.total : 0}
                    tone={errorRows.size === 0 ? "success" : "warning"}
                    className="mt-2"
                    label={`${imported.valid.length} of ${imported.total} rows imported`}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <StatTile label="Imported" value={qty(imported.valid.length)} tone="success" />
                  <StatTile
                    label="Skipped"
                    value={qty(errorRows.size)}
                    tone={errorRows.size > 0 ? "danger" : "neutral"}
                  />
                  <StatTile
                    label="Warnings"
                    value={qty(warnings.length)}
                    tone={warnings.length > 0 ? "warning" : "neutral"}
                  />
                </div>

                {errorRows.size > 0 && (
                  <div className="rounded-md border border-status-warning-border bg-status-warning-bg p-3">
                    <p className="text-[13px] font-medium text-status-warning">
                      {plural(errorRows.size, "row")} were not imported
                    </p>
                    <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
                      Nothing from those rows was written — no partial records exist. Fix them in
                      the source file and import that file on its own; a file that repeats an
                      identifier already on record is rejected whole.
                    </p>
                  </div>
                )}
              </div>
            </Section>
          </div>

          <div className="grid content-start gap-4">
            <Section title="What happens next">
              <ul className="grid gap-2 text-caption leading-relaxed text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-status-success" aria-hidden />
                  Each imported record is written to the audit log against your name.
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-status-success" aria-hidden />
                  {kind === "stock"
                    ? "Each opening-stock row posted a count-correction through the movement ledger."
                    : "Every row was written as one transaction — the whole file landed, or none of it."}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-status-success" aria-hidden />
                  Reorder points and stock health recalculate immediately.
                </li>
              </ul>
            </Section>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-8" onClick={reset}>
                <Upload className="size-3.5" aria-hidden />
                Import another file
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() =>
                  router.push(
                    kind === "products"
                      ? "/inventory/products"
                      : kind === "suppliers"
                        ? "/purchasing/suppliers"
                        : kind === "customers"
                          ? "/sales/customers"
                          : "/inventory/stock-levels",
                  )
                }
              >
                View {schema.label.toLowerCase()}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
