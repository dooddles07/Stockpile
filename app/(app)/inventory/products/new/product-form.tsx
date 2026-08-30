"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save } from "lucide-react";
import { toast } from "sonner";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section } from "@/components/record/field-grid";
import { money, percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveProduct } from "./actions";

const UNITS = ["unit", "box", "case", "pack", "roll", "pair", "bay", "kit", "set", "drum"];

/** Base UI needs a value→label map or Select.Value renders the raw value. */
const UNIT_LABELS = Object.fromEntries(UNITS.map((u) => [u, u]));

const schema = z
  .object({
    sku: z
      .string()
      .min(3, "A SKU needs at least 3 characters.")
      .max(32, "Keep SKUs under 32 characters so they fit on a label.")
      .regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers and hyphens only."),
    name: z.string().min(3, "Give the product a name people will recognise."),
    categoryId: z.string().min(1, "Pick a category."),
    brand: z.string().min(1, "Enter a brand."),
    supplierId: z.string().min(1, "Pick the primary supplier."),
    unit: z.string().min(1),
    barcode: z
      .union([z.literal(""), z.string().regex(/^\d{13}$/, "An EAN-13 barcode is exactly 13 digits.")]),
    unitCost: z.number().min(0, "Cost cannot be negative."),
    sellPrice: z.number().min(0, "Price cannot be negative."),
    reorderPoint: z.number().int().min(0),
    reorderQty: z.number().int().min(1, "Reorder quantity must be at least 1."),
    leadTimeDays: z.number().int().min(0).max(365),
    description: z.string().max(500),
    batchTracked: z.boolean(),
    serialTracked: z.boolean(),
    hasExpiry: z.boolean(),
    shelfLifeDays: z.number().int().min(0),
  })
  // Selling below cost is legitimate (clearance), but it is never a typo you
  // want to discover after a thousand units have shipped.
  .refine((v) => v.sellPrice === 0 || v.sellPrice >= v.unitCost, {
    path: ["sellPrice"],
    message: "Selling price is below unit cost. Set it to 0 if this is deliberate.",
  })
  .refine((v) => !v.hasExpiry || v.shelfLifeDays > 0, {
    path: ["shelfLifeDays"],
    message: "A perishable product needs a shelf life so expiry dates can be calculated.",
  });

export type ProductFormValues = z.infer<typeof schema>;

export function ProductForm({
  categories,
  suppliers,
  suggestedSku,
  id,
  initial,
  returnTo = "/inventory/products",
}: {
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  suggestedSku: string;
  /** The product's primary key, present when editing. */
  id?: string;
  /** Present when editing: the record as it stands today. */
  initial?: Partial<ProductFormValues>;
  returnTo?: string;
}) {
  const router = useRouter();
  const editing = initial !== undefined;
  const categoryLabels = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const supplierLabels = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      sku: suggestedSku,
      name: "",
      categoryId: categories[0]?.id ?? "",
      brand: "",
      supplierId: suppliers[0]?.id ?? "",
      unit: "unit",
      barcode: "",
      unitCost: 0,
      sellPrice: 0,
      reorderPoint: 25,
      reorderQty: 50,
      leadTimeDays: 14,
      description: "",
      batchTracked: false,
      serialTracked: false,
      hasExpiry: false,
      shelfLifeDays: 0,
      ...initial,
    },
  });

  const unitCost = watch("unitCost") || 0;
  const sellPrice = watch("sellPrice") || 0;
  const hasExpiry = watch("hasExpiry");
  const margin = sellPrice > 0 ? (sellPrice - unitCost) / sellPrice : 0;

  const onSubmit = async (values: ProductFormValues) => {
    const result = await saveProduct({ ...values, id });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(editing ? `${values.sku} updated` : `${values.sku} created`, {
      description: editing
        ? `${values.name} saved. Changes apply to future movements, not to stock already on the shelf.`
        : `${values.name} is now in the catalogue with a reorder point of ${values.reorderPoint}.`,
    });
    router.push(returnTo);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 lg:grid-cols-3" noValidate>
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section title="Identity" description="How this product is found, scanned and labelled.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="sku">SKU</FieldLabel>
              <Input
                id="sku"
                {...register("sku")}
                className="text-code"
                autoComplete="off"
                aria-invalid={Boolean(errors.sku)}
              />
              <FieldDescription>
                Suggested from the category prefix. Must be unique across the catalogue.
              </FieldDescription>
              <FieldError errors={[errors.sku]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="barcode">Barcode (EAN-13)</FieldLabel>
              <Input
                id="barcode"
                {...register("barcode")}
                className="text-code"
                inputMode="numeric"
                placeholder="Optional"
                aria-invalid={Boolean(errors.barcode)}
              />
              <FieldDescription>Leave blank to assign one at first receipt.</FieldDescription>
              <FieldError errors={[errors.barcode]} />
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="name">Product name</FieldLabel>
              <Input
                id="name"
                {...register("name")}
                placeholder="e.g. Kestrel Wireless Barcode Scanner — 2D Bluetooth"
                aria-invalid={Boolean(errors.name)}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="brand">Brand</FieldLabel>
              <Input id="brand" {...register("brand")} aria-invalid={Boolean(errors.brand)} />
              <FieldError errors={[errors.brand]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="categoryId">Category</FieldLabel>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select items={categoryLabels} value={field.value} onValueChange={(v) => field.onChange(v)}>
                    <SelectTrigger id="categoryId">
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
                )}
              />
              <FieldError errors={[errors.categoryId]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="unit">Unit of measure</FieldLabel>
              <Controller
                control={control}
                name="unit"
                render={({ field }) => (
                  <Select items={UNIT_LABELS} value={field.value} onValueChange={(v) => field.onChange(v)}>
                    <SelectTrigger id="unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>What one unit of stock means for this product.</FieldDescription>
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea
                id="description"
                rows={3}
                {...register("description")}
                placeholder="What it is, and anything the warehouse should know when handling it."
              />
              <FieldError errors={[errors.description]} />
            </Field>
          </div>
        </Section>

        <Section title="Pricing" description="Cost and price drive valuation and margin reporting.">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="unitCost">Unit cost</FieldLabel>
              <Input
                id="unitCost"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                className="text-right tabular"
                aria-invalid={Boolean(errors.unitCost)}
                {...register("unitCost", { valueAsNumber: true })}
              />
              <FieldError errors={[errors.unitCost]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="sellPrice">Selling price</FieldLabel>
              <Input
                id="sellPrice"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                className="text-right tabular"
                aria-invalid={Boolean(errors.sellPrice)}
                {...register("sellPrice", { valueAsNumber: true })}
              />
              <FieldError errors={[errors.sellPrice]} />
            </Field>

            <Field>
              <FieldLabel>Gross margin</FieldLabel>
              <output
                className={cn(
                  "flex h-9 items-center justify-end rounded-md border bg-surface-sunken px-3 text-[13px] font-semibold tabular",
                  margin < 0
                    ? "text-status-danger"
                    : margin < 0.2
                      ? "text-status-warning"
                      : "text-status-success",
                )}
              >
                {sellPrice > 0 ? percent(margin, 1) : "—"}
              </output>
              <FieldDescription>
                {sellPrice > 0
                  ? `${money(sellPrice - unitCost, { cents: true })} per unit`
                  : "Set a selling price to see margin"}
              </FieldDescription>
            </Field>
          </div>
        </Section>
      </div>

      <div className="grid content-start gap-4">
        <Section title="Reorder policy" description="When and how much to buy back.">
          <div className="grid gap-5">
            <Field>
              <FieldLabel htmlFor="reorderPoint">Reorder point</FieldLabel>
              <Input
                id="reorderPoint"
                type="number"
                min={0}
                inputMode="numeric"
                className="text-right tabular"
                aria-invalid={Boolean(errors.reorderPoint)}
                {...register("reorderPoint", { valueAsNumber: true })}
              />
              <FieldDescription>
                Below this available quantity the product appears in Low stock and triggers the
                reorder automation.
              </FieldDescription>
              <FieldError errors={[errors.reorderPoint]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="reorderQty">Reorder quantity</FieldLabel>
              <Input
                id="reorderQty"
                type="number"
                min={1}
                inputMode="numeric"
                className="text-right tabular"
                aria-invalid={Boolean(errors.reorderQty)}
                {...register("reorderQty", { valueAsNumber: true })}
              />
              <FieldError errors={[errors.reorderQty]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="leadTimeDays">Lead time (days)</FieldLabel>
              <Input
                id="leadTimeDays"
                type="number"
                min={0}
                max={365}
                inputMode="numeric"
                className="text-right tabular"
                aria-invalid={Boolean(errors.leadTimeDays)}
                {...register("leadTimeDays", { valueAsNumber: true })}
              />
              <FieldError errors={[errors.leadTimeDays]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="supplierId">Primary supplier</FieldLabel>
              <Controller
                control={control}
                name="supplierId"
                render={({ field }) => (
                  <Select items={supplierLabels} value={field.value} onValueChange={(v) => field.onChange(v)}>
                    <SelectTrigger id="supplierId">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.supplierId]} />
            </Field>
          </div>
        </Section>

        <Section title="Tracking" description="How individual units are identified in the warehouse.">
          <div className="grid gap-4">
            {(
              [
                {
                  name: "batchTracked",
                  label: "Batch / lot tracked",
                  hint: "Receipts record a lot number.",
                },
                {
                  name: "serialTracked",
                  label: "Serial tracked",
                  hint: "Every unit is scanned individually.",
                },
                {
                  name: "hasExpiry",
                  label: "Perishable",
                  hint: "Expiry is tracked and warned on.",
                },
              ] as const
            ).map((toggle) => (
              <Field key={toggle.name} orientation="horizontal" className="justify-between">
                <div className="min-w-0">
                  <FieldLabel htmlFor={toggle.name}>{toggle.label}</FieldLabel>
                  <FieldDescription>{toggle.hint}</FieldDescription>
                </div>
                <Controller
                  control={control}
                  name={toggle.name}
                  render={({ field }) => (
                    <Switch
                      id={toggle.name}
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v)}
                    />
                  )}
                />
              </Field>
            ))}

            {hasExpiry && (
              <Field>
                <FieldLabel htmlFor="shelfLifeDays">Shelf life (days)</FieldLabel>
                <Input
                  id="shelfLifeDays"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className="text-right tabular"
                  aria-invalid={Boolean(errors.shelfLifeDays)}
                  {...register("shelfLifeDays", { valueAsNumber: true })}
                />
                <FieldDescription>Counted from the date of receipt.</FieldDescription>
                <FieldError errors={[errors.shelfLifeDays]} />
              </Field>
            )}
          </div>
        </Section>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" className="h-8" disabled={isSubmitting}>
            <Save className="size-3.5" aria-hidden />
            {editing ? "Save changes" : "Create product"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => router.push(returnTo)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
