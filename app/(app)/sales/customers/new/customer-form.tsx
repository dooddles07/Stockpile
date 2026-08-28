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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section } from "@/components/record/field-grid";
import { money } from "@/lib/format";

const TYPES = {
  wholesale: "Wholesale",
  retail: "Retail",
  online: "Online",
  government: "Government",
} as const;

const TYPE_HINT: Record<keyof typeof TYPES, string> = {
  wholesale: "Ordered by the pallet, invoiced on terms, price list applies.",
  retail: "Store accounts ordering in case quantities.",
  online: "Web and marketplace orders, paid at checkout.",
  government: "Contract pricing and purchase-order numbers are mandatory.",
};

const TERMS = ["Prepaid", "Net 15", "Net 30", "Net 45", "Net 60"];
const COUNTRIES = ["United States", "Canada", "Mexico", "United Kingdom", "Germany", "Netherlands"];

/** Base UI needs a value→label map or Select.Value renders the raw value. */
const asLabels = (values: string[]) => Object.fromEntries(values.map((v) => [v, v]));

const schema = z
  .object({
    code: z
      .string()
      .min(3, "A customer code needs at least 3 characters.")
      .max(12, "Keep codes short — they appear on every order and invoice.")
      .regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers and hyphens only."),
    name: z.string().min(2, "Enter the account's registered name."),
    type: z.enum(["retail", "wholesale", "online", "government"]),
    contactName: z.string().min(2, "Name the person who places the orders."),
    email: z.string().email("That does not look like an email address."),
    phone: z.string().min(7, "Enter a phone number someone can call."),
    city: z.string().min(2, "Enter a city."),
    country: z.string().min(1),
    paymentTerms: z.string().min(1),
    creditLimit: z.number().min(0, "A credit limit cannot be negative."),
  })
  // Terms without a limit is how an account quietly runs up an unrecoverable
  // balance. Prepaid is the one case where zero is the correct answer.
  .refine((v) => v.paymentTerms === "Prepaid" || v.creditLimit > 0, {
    path: ["creditLimit"],
    message: "An account on terms needs a credit limit. Use Prepaid if you do not want to extend credit.",
  });

export type CustomerFormValues = z.infer<typeof schema>;

export function CustomerForm({
  suggestedCode,
  initial,
  returnTo = "/sales/customers",
}: {
  suggestedCode: string;
  /** Present when editing: the record as it stands today. */
  initial?: Partial<CustomerFormValues>;
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
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      code: suggestedCode,
      name: "",
      type: "wholesale",
      contactName: "",
      email: "",
      phone: "",
      city: "",
      country: "United States",
      paymentTerms: "Net 30",
      creditLimit: 25000,
      ...initial,
    },
  });

  const type = watch("type");
  const paymentTerms = watch("paymentTerms");
  const creditLimit = watch("creditLimit") || 0;

  const onSubmit = (values: CustomerFormValues) => {
    toast.success(`${values.code} — ${values.name} ${editing ? "updated" : "added"}`, {
      description:
        values.paymentTerms === "Prepaid"
          ? "Prepaid account. Orders will not ship until payment clears."
          : `${values.paymentTerms} with a ${money(values.creditLimit)} credit limit.`,
    });
    router.push(returnTo);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
      <Section title="Account" description="How this customer is referenced on orders and invoices.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="code">Customer code</FieldLabel>
            <Input
              id="code"
              {...register("code")}
              className="text-code"
              autoComplete="off"
              aria-invalid={Boolean(errors.code)}
            />
            <FieldDescription>Appears on every order, pick list and invoice.</FieldDescription>
            <FieldError errors={[errors.code]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="name">Account name</FieldLabel>
            <Input
              id="name"
              {...register("name")}
              placeholder="e.g. Northgate Retail Group"
              aria-invalid={Boolean(errors.name)}
            />
            <FieldError errors={[errors.name]} />
          </Field>

          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="type">Account type</FieldLabel>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select items={TYPES} value={field.value} onValueChange={(v) => field.onChange(v)}>
                  <SelectTrigger id="type" className="sm:max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>{TYPE_HINT[type]}</FieldDescription>
            <FieldError errors={[errors.type]} />
          </Field>
        </div>
      </Section>

      <Section title="Contact" description="Who places the orders and where they ship.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="contactName">Primary contact</FieldLabel>
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
            <FieldDescription>Order confirmations and dispatch notes go here.</FieldDescription>
            <FieldError errors={[errors.email]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input id="phone" {...register("phone")} aria-invalid={Boolean(errors.phone)} />
            <FieldError errors={[errors.phone]} />
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
        title="Credit"
        description="Orders that would take this account past its limit are held for approval rather than reserved."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="paymentTerms">Payment terms</FieldLabel>
            <Controller
              control={control}
              name="paymentTerms"
              render={({ field }) => (
                <Select
                  items={asLabels(TERMS)}
                  value={field.value}
                  onValueChange={(v) => field.onChange(v)}
                >
                  <SelectTrigger id="paymentTerms">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TERMS.map((t) => (
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
            <FieldLabel htmlFor="creditLimit">Credit limit</FieldLabel>
            <Input
              id="creditLimit"
              type="number"
              min={0}
              step={500}
              inputMode="decimal"
              className="text-right tabular"
              aria-invalid={Boolean(errors.creditLimit)}
              {...register("creditLimit", { valueAsNumber: true })}
            />
            <FieldDescription>
              {paymentTerms === "Prepaid"
                ? "Prepaid accounts pay before dispatch, so no credit is extended."
                : `${money(creditLimit)} of unpaid invoices allowed before orders are held.`}
            </FieldDescription>
            <FieldError errors={[errors.creditLimit]} />
          </Field>
        </div>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="h-8" disabled={isSubmitting}>
          <Save className="size-3.5" aria-hidden />
          {editing ? "Save changes" : "Add customer"}
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
