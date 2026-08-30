"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section } from "@/components/record/field-grid";
import { saveCategory } from "./actions";

const ROOT = "—none—";

const schema = z.object({
  name: z.string().min(2, "Name the category as a buyer would search for it."),
  parentId: z.string(),
  description: z
    .string()
    .min(10, "One line on what belongs here — it is what stops the catalogue drifting.")
    .max(240, "Keep it to a sentence."),
});

export type CategoryFormValues = z.infer<typeof schema>;

/** A slug is derived, never typed: two people would spell it two ways. */
const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function CategoryForm({
  parents,
  takenSlugs,
  id,
  initial,
  returnTo = "/inventory/categories",
}: {
  parents: { id: string; name: string }[];
  takenSlugs: string[];
  /** Present when editing. */
  id?: string;
  initial?: Partial<CategoryFormValues>;
  returnTo?: string;
}) {
  const router = useRouter();
  const editing = id !== undefined;

  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: { name: "", parentId: ROOT, description: "", ...initial },
  });

  const name = watch("name");
  const slug = slugify(name || "");
  const parentLabels = React.useMemo(
    () => ({ [ROOT]: "Top level", ...Object.fromEntries(parents.map((p) => [p.id, p.name])) }),
    [parents],
  );

  const onSubmit = async (values: CategoryFormValues) => {
    // The slug is what every report groups by, so a collision would silently
    // merge two categories rather than fail loudly. The server enforces this
    // too; catching it here keeps the message on the field.
    if (takenSlugs.includes(slug)) {
      setError("name", { message: `${slug} is already in use. Give this one a distinct name.` });
      return;
    }

    const result = await saveCategory({ ...values, id });
    if (!result.ok) {
      if (result.code === "conflict") {
        setError("name", { message: result.message });
      } else {
        toast.error(result.message);
      }
      return;
    }

    const parent = parents.find((p) => p.id === values.parentId);
    toast.success(`${values.name} ${editing ? "updated" : "created"}`, {
      description: editing
        ? "The category record is saved."
        : parent
          ? `Filed under ${parent.name}. Products can be assigned to it straight away.`
          : "Added at the top level of the catalogue tree.",
    });
    router.push(returnTo);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid max-w-2xl gap-4" noValidate>
      <Section title="Category" description="Where this sits in the tree, and what belongs in it.">
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input id="name" {...register("name")} aria-invalid={!!errors.name} />
            <FieldDescription>
              {slug ? (
                <>
                  Reports and filters will group on <span className="text-code">{slug}</span>.
                </>
              ) : (
                "The URL slug is derived from the name."
              )}
            </FieldDescription>
            <FieldError errors={[errors.name]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="parentId">Parent</FieldLabel>
            <Controller
              control={control}
              name="parentId"
              render={({ field }) => (
                <Select items={parentLabels} value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="parentId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT}>Top level</SelectItem>
                    {parents.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>
              Stock value rolls up to the parent, so a child category is counted twice only if you
              report on both.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="description">What belongs here</FieldLabel>
            <Textarea
              id="description"
              rows={3}
              {...register("description")}
              aria-invalid={!!errors.description}
              placeholder="e.g. Scanners, label printers, ribbons and media used for SKU identification."
            />
            <FieldError errors={[errors.description]} />
          </Field>
        </div>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="h-8" disabled={isSubmitting}>
          <Save className="size-3.5" aria-hidden />
          {editing ? "Save changes" : "Create category"}
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
