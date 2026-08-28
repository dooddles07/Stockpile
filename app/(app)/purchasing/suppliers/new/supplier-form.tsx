"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section } from "@/components/record/field-grid";
import { plural } from "@/lib/format";

const PAYMENT_TERMS = ["Net 15", "Net 30", "Net 45", "Net 60", "2/10 Net 30", "Prepaid"];
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "MXN"];
const COUNTRIES = [
  "United States",
  "Canada",
  "Mexico",
  "United Kingdom",
  "Germany",
  "Netherlands",
  "Poland",
  "China",
  "Taiwan",
  "Vietnam",
];

/** Base UI needs a value→label map or Select.Value renders the raw value. */
const asLabels = (values: string[]) => Object.fromEntries(values.map((v) => [v, v]));

const schema = z.object({
  code: z
    .string()
    .min(3, "A supplier code needs at least 3 characters.")
    .max(12, "Keep codes short — they appear on every purchase order.")
    .regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers and hyphens only."),
  name: z.string().min(2, "Enter the supplier's registered name."),
  contactName: z.string().min(2, "Name the person who answers a purchase order."),
  email: z.string().email("That does not look like an email address."),
  phone: z.string().min(7, "Enter a phone number a buyer can actually call."),
  addressLine: z.string().min(4, "Enter the street address goods are shipped from."),
  city: z.string().min(2, "Enter a city."),
  country: z.string().min(1),
  paymentTerms: z.string().min(1),
  currency: z.string().min(1),
  leadTimeDays: z
    .number()
    .int()
    .min(1, "Lead time must be at least a day.")
    .max(365, "Anything over a year should be handled as a project, not a lead time."),
  categories: z.array(z.string()).min(1, "Pick at least one category this supplier covers."),
});

export type SupplierFormValues = z.infer<typeof schema>;

export function SupplierForm({
  categories,
  suggestedCode,
  initial,
  returnTo = "/purchasing/suppliers",
}: {
  categories: { id: string; name: string }[];
  suggestedCode: string;
  /** Present when editing: the record as it stands today. */
  initial?: Partial<SupplierFormValues>;
  returnTo?: string;
}) {
  const router = useRouter();
  const editing = initial !== undefined;

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      code: suggestedCode,
      name: "",
      contactName: "",
      email: "",
      phone: "",
      addressLine: "",
      city: "",
      country: "United States",
      paymentTerms: "Net 30",
      currency: "USD",
      leadTimeDays: 14,
      categories: [],
      ...initial,
    },
  });

  const selected = watch("categories");
  const leadTimeDays = watch("leadTimeDays") || 0;

  const onSubmit = (values: SupplierFormValues) => {
    toast.success(`${values.code} — ${values.name} ${editing ? "updated" : "added"}`, {
      description: `${values.paymentTerms}, ${values.leadTimeDays}-day lead time, covering ${plural(
        values.categories.length,
        "category",
        "categories",
      )}.`,
    });
    router.push(returnTo);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
      <Section
        title="Identity"
        description="How this supplier is referenced on purchase orders and in the ledger."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="code">Supplier code</FieldLabel>
            <Input
              id="code"
              {...register("code")}
              className="text-code"
              autoComplete="off"
              aria-invalid={Boolean(errors.code)}
            />
            <FieldDescription>Printed on every PO. Cannot be changed once orders exist.</FieldDescription>
            <FieldError errors={[errors.code]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="name">Supplier name</FieldLabel>
            <Input
              id="name"
              {...register("name")}
              placeholder="e.g. Kestrel Labels & Media"
              aria-invalid={Boolean(errors.name)}
            />
            <FieldError errors={[errors.name]} />
          </Field>
        </div>
      </Section>

      <Section title="Contact" description="Who to chase when an order is late.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="contactName">Account manager</FieldLabel>
            <Input
              id="contactName"
              {...register("contactName")}
              aria-invalid={Boolean(errors.contactName)}
            />
            <FieldError errors={[errors.contactName]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              {...register("email")}
              autoComplete="off"
              aria-invalid={Boolean(errors.email)}
            />
            <FieldDescription>Purchase orders are sent here.</FieldDescription>
            <FieldError errors={[errors.email]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input id="phone" {...register("phone")} aria-invalid={Boolean(errors.phone)} />
            <FieldError errors={[errors.phone]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="addressLine">Ships from</FieldLabel>
            <Input
              id="addressLine"
              {...register("addressLine")}
              placeholder="Street address"
              aria-invalid={Boolean(errors.addressLine)}
            />
            <FieldError errors={[errors.addressLine]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="city">City</FieldLabel>
            <Input id="city" {...register("city")} aria-invalid={Boolean(errors.city)} />
            <FieldError errors={[errors.city]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="country">Country</FieldLabel>
            <Controller
              control={control}
              name="country"
              render={({ field }) => (
                <Select
                  items={asLabels(COUNTRIES)}
                  value={field.value}
                  onValueChange={(v) => field.onChange(v)}
                >
                  <SelectTrigger id="country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[errors.country]} />
          </Field>
        </div>
      </Section>

      <Section
        title="Commercial terms"
        description="These become the defaults on every purchase order raised against this supplier."
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="paymentTerms">Payment terms</FieldLabel>
            <Controller
              control={control}
              name="paymentTerms"
              render={({ field }) => (
                <Select
                  items={asLabels(PAYMENT_TERMS)}
                  value={field.value}
                  onValueChange={(v) => field.onChange(v)}
                >
                  <SelectTrigger id="paymentTerms">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[errors.paymentTerms]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="currency">Currency</FieldLabel>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  items={asLabels(CURRENCIES)}
                  value={field.value}
                  onValueChange={(v) => field.onChange(v)}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[errors.currency]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="leadTimeDays">Quoted lead time (days)</FieldLabel>
            <Input
              id="leadTimeDays"
              type="number"
              min={1}
              max={365}
              inputMode="numeric"
              className="text-right tabular"
              aria-invalid={Boolean(errors.leadTimeDays)}
              {...register("leadTimeDays", { valueAsNumber: true })}
            />
            <FieldDescription>
              Reorder suggestions assume stock arrives in {leadTimeDays || "—"} days.
            </FieldDescription>
            <FieldError errors={[errors.leadTimeDays]} />
          </Field>
        </div>
      </Section>

      <Section
        title="Catalogue coverage"
        description="Which categories this supplier can quote. Used to suggest a source when a SKU falls below its reorder point."
      >
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Controller
            control={control}
            name="categories"
            render={({ field }) => (
              <>
                {categories.map((category) => {
                  const checked = field.value.includes(category.id);
                  return (
                    <label
                      key={category.id}
                      htmlFor={`cat-${category.id}`}
                      className="flex cursor-pointer items-center gap-2.5 rounded border bg-surface px-2.5 py-2 text-[13px] transition-colors hover:bg-surface-sunken"
                    >
                      <Checkbox
                        id={`cat-${category.id}`}
                        checked={checked}
                        onCheckedChange={(value) =>
                          field.onChange(
                            value
                              ? [...field.value, category.id]
                              : field.value.filter((id: string) => id !== category.id),
                          )
                        }
                      />
                      <span className="min-w-0 truncate">{category.name}</span>
                    </label>
                  );
                })}
              </>
            )}
          />
        </div>
        <p className="mt-3 text-caption text-muted-foreground">
          {selected.length > 0
            ? `${plural(selected.length, "category", "categories")} selected.`
            : "No categories selected yet."}
        </p>
        <FieldError errors={[errors.categories]} />
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="h-8" disabled={isSubmitting}>
          <Save className="size-3.5" aria-hidden />
          {editing ? "Save changes" : "Add supplier"}
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
    </form>
  );
}
