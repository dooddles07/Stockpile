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
import { qty } from "@/lib/format";
import { saveWarehouse } from "./actions";

const TYPES: Record<string, string> = {
  distribution: "Distribution centre",
  retail: "Retail back-of-house",
  fulfillment: "Fulfillment centre",
  cold: "Cold store",
};

const STATUSES: Record<string, string> = {
  operational: "Operational",
  maintenance: "Under maintenance",
  closed: "Closed",
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Amsterdam",
];

const schema = z.object({
  code: z
    .string()
    .min(2, "A site code needs at least 2 characters.")
    .max(8, "Site codes are printed on every label — keep them short.")
    .regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers and hyphens only."),
  name: z.string().min(3, "Name the site as people on the floor refer to it."),
  type: z.string().min(1),
  status: z.string().min(1),
  addressLine: z.string().min(4, "Enter the street address deliveries arrive at."),
  city: z.string().min(2, "Enter a city."),
  region: z.string().min(2, "Enter a state, province or region."),
  country: z.string().min(2, "Enter a country."),
  managerId: z.string().min(1, "Every site needs someone accountable for its stock."),
  capacityPallets: z
    .number()
    .int()
    .min(1, "Capacity has to be at least one pallet.")
    .max(200_000, "That is larger than any single building — split it into zones."),
  timezone: z.string().min(1),
});

export type WarehouseFormValues = z.infer<typeof schema>;

/**
 * A site is the unit every other record hangs off — stock rows, transfers,
 * pick lists and receipts all point at one. The fields that matter operationally
 * are capacity and the person accountable for it; the address only matters on
 * the day a lorry has to find the door.
 */
export function WarehouseForm({
  managers,
  suggestedCode,
  usedPallets = 0,
  id,
  initial,
  returnTo = "/warehousing/warehouses",
}: {
  managers: { id: string; name: string }[];
  suggestedCode: string;
  /** Pallets already occupied — capacity cannot be set below what is stored. */
  usedPallets?: number;
  /** The site's primary key, present when editing. */
  id?: string;
  initial?: Partial<WarehouseFormValues>;
  returnTo?: string;
}) {
  const router = useRouter();
  const editing = initial !== undefined;
  const managerLabels = Object.fromEntries(managers.map((m) => [m.id, m.name]));

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<WarehouseFormValues>({
    resolver: zodResolver(
      schema.refine((v) => v.capacityPallets >= usedPallets, {
        path: ["capacityPallets"],
        message: `${qty(usedPallets)} pallets are stored here today. Capacity cannot be set below that.`,
      }),
    ),
    mode: "onBlur",
    defaultValues: {
      code: suggestedCode,
      name: "",
      type: "distribution",
      status: "operational",
      addressLine: "",
      city: "",
      region: "",
      country: "United States",
      managerId: managers[0]?.id ?? "",
      capacityPallets: 4000,
      timezone: "America/New_York",
      ...initial,
    },
  });

  const capacity = watch("capacityPallets") || 0;
  const status = watch("status");

  const onSubmit = async (values: WarehouseFormValues) => {
    const result = await saveWarehouse({ ...values, id });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`${values.code} — ${values.name} ${editing ? "updated" : "created"}`, {
      description:
        values.status === "operational"
          ? `${TYPES[values.type]} with room for ${qty(values.capacityPallets)} pallets.`
          : `Saved as ${STATUSES[values.status].toLowerCase()}. Stock stays visible but nothing new can be received here.`,
    });
    router.push(returnTo);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
      <Section title="Identity" description="How this site is referenced everywhere else in the system.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="code">Site code</FieldLabel>
            <Input id="code" {...register("code")} className="text-code" aria-invalid={!!errors.code} />
            <FieldDescription>Printed on labels, pick sheets and transfer documents.</FieldDescription>
            <FieldError errors={[errors.code]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="name">Site name</FieldLabel>
            <Input id="name" {...register("name")} aria-invalid={!!errors.name} />
            <FieldError errors={[errors.name]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="type">Type</FieldLabel>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} items={TYPES}>
                  <SelectTrigger id="type">
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
          </Field>

          <Field>
            <FieldLabel htmlFor="status">Status</FieldLabel>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} items={STATUSES}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUSES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>
              {status === "operational"
                ? "Receiving, picking and transfers all run normally."
                : "Existing stock stays counted and visible. Nothing new can be received."}
            </FieldDescription>
          </Field>
        </div>
      </Section>

      <Section title="Address" description="Where a delivery driver actually goes.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="addressLine">Street address</FieldLabel>
            <Input id="addressLine" {...register("addressLine")} aria-invalid={!!errors.addressLine} />
            <FieldError errors={[errors.addressLine]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="city">City</FieldLabel>
            <Input id="city" {...register("city")} aria-invalid={!!errors.city} />
            <FieldError errors={[errors.city]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="region">State or region</FieldLabel>
            <Input id="region" {...register("region")} aria-invalid={!!errors.region} />
            <FieldError errors={[errors.region]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="country">Country</FieldLabel>
            <Input id="country" {...register("country")} aria-invalid={!!errors.country} />
            <FieldError errors={[errors.country]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
            <Controller
              control={control}
              name="timezone"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  items={Object.fromEntries(TIMEZONES.map((t) => [t, t]))}
                >
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>Cut-off times and shift reports are read in this zone.</FieldDescription>
          </Field>
        </div>
      </Section>

      <Section title="Capacity and ownership" description="What the building holds, and who answers for it.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="capacityPallets">Pallet capacity</FieldLabel>
            <Input
              id="capacityPallets"
              type="number"
              min={1}
              className="tabular"
              {...register("capacityPallets", { valueAsNumber: true })}
              aria-invalid={!!errors.capacityPallets}
            />
            <FieldDescription>
              {usedPallets > 0
                ? `${qty(usedPallets)} pallets stored today — ${
                    capacity > 0 ? Math.round((usedPallets / capacity) * 100) : 0
                  }% of this figure.`
                : "Drives the utilisation figure on the warehouse dashboard."}
            </FieldDescription>
            <FieldError errors={[errors.capacityPallets]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="managerId">Site manager</FieldLabel>
            <Controller
              control={control}
              name="managerId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} items={managerLabels}>
                  <SelectTrigger id="managerId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>Approvals raised at this site route to them first.</FieldDescription>
            <FieldError errors={[errors.managerId]} />
          </Field>
        </div>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="h-8" disabled={isSubmitting}>
          <Save className="size-3.5" aria-hidden />
          {editing ? "Save changes" : "Create site"}
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
