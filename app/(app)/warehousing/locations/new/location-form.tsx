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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section } from "@/components/record/field-grid";
import { humanize } from "@/lib/status";
import { saveLocation } from "./actions";

const TYPES = ["bin", "shelf", "floor", "staging", "quarantine"] as const;
const TYPE_LABELS = Object.fromEntries(TYPES.map((t) => [t, humanize(t)]));

const schema = z.object({
  warehouseId: z.string().min(1, "Pick the site this location belongs to."),
  zone: z.string().trim().min(1, "Zone is part of the address a picker reads.").max(4),
  aisle: z.string().trim().min(1, "Aisle is part of the address.").max(4),
  rack: z.string().trim().min(1, "Rack is part of the address.").max(4),
  bin: z.string().trim().min(1, "Bin is part of the address.").max(4),
  type: z.enum(TYPES),
  capacityUnits: z
    .number()
    .int()
    .min(1, "Capacity has to be at least one unit.")
    .max(1_000_000, "That is more than a building holds — split it."),
  restricted: z.boolean(),
});

export type LocationFormValues = z.infer<typeof schema>;

/** `zone-aisle-rack-bin`, the code printed on the shelf label. */
const codeOf = (v: Pick<LocationFormValues, "zone" | "aisle" | "rack" | "bin">) =>
  [v.zone, v.aisle, v.rack, v.bin].map((p) => p.trim().toUpperCase()).join("-");

export function LocationForm({
  warehouses,
  id,
  initial,
  returnTo = "/warehousing/locations",
}: {
  warehouses: { id: string; name: string }[];
  /** Present when editing. */
  id?: string;
  initial?: Partial<LocationFormValues>;
  returnTo?: string;
}) {
  const router = useRouter();
  const editing = id !== undefined;
  const warehouseLabels = Object.fromEntries(warehouses.map((w) => [w.id, w.name]));

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LocationFormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      warehouseId: warehouses[0]?.id ?? "",
      zone: "",
      aisle: "",
      rack: "",
      bin: "",
      type: "bin",
      capacityUnits: 500,
      restricted: false,
      ...initial,
    },
  });

  const code = codeOf(watch());

  const onSubmit = async (values: LocationFormValues) => {
    const result = await saveLocation({ ...values, id });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(editing ? `${code} updated` : `${code} added`, {
      description: editing
        ? "The location record is saved."
        : "Stock can be put away here as soon as the next receipt is booked in.",
    });
    router.push(returnTo);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid max-w-2xl gap-4" noValidate>
      <Section title="Location" description="Where this sits, and what a picker reads off the label.">
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="warehouseId">Site</FieldLabel>
            <Controller
              control={control}
              name="warehouseId"
              render={({ field }) => (
                <Select items={warehouseLabels} value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="warehouseId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[errors.warehouseId]} />
          </Field>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(["zone", "aisle", "rack", "bin"] as const).map((part) => (
              <Field key={part}>
                <FieldLabel htmlFor={part}>{humanize(part)}</FieldLabel>
                <Input
                  id={part}
                  {...register(part)}
                  className="text-code uppercase"
                  autoComplete="off"
                  aria-invalid={Boolean(errors[part])}
                />
                <FieldError errors={[errors[part]]} />
              </Field>
            ))}
          </div>

          <FieldDescription>
            The location code will be <span className="text-code">{code || "—"}</span>.
          </FieldDescription>

          <Field>
            <FieldLabel htmlFor="type">Type</FieldLabel>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select items={TYPE_LABELS} value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {humanize(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="capacityUnits">Capacity (units)</FieldLabel>
            <Input
              id="capacityUnits"
              type="number"
              min={1}
              inputMode="numeric"
              className="text-right tabular"
              aria-invalid={Boolean(errors.capacityUnits)}
              {...register("capacityUnits", { valueAsNumber: true })}
            />
            <FieldError errors={[errors.capacityUnits]} />
          </Field>

          <Field orientation="horizontal" className="justify-between">
            <div className="min-w-0">
              <FieldLabel htmlFor="restricted">Restricted access</FieldLabel>
              <FieldDescription>Needs authorisation to pick from.</FieldDescription>
            </div>
            <Controller
              control={control}
              name="restricted"
              render={({ field }) => (
                <Switch id="restricted" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </Field>
        </div>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="h-8" disabled={isSubmitting}>
          <Save className="size-3.5" aria-hidden />
          {editing ? "Save changes" : "Add location"}
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
