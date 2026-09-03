"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/record/field-grid";
import { saveCompanySettings } from "./actions";

const schema = z.object({
  companyName: z.string().trim().min(1, "The company needs a name — it is shown wherever the app identifies itself."),
  companyAddress: z.string().trim().min(1, "A trading address appears on documents sent to suppliers and customers."),
});

type Values = z.infer<typeof schema>;

export function CompanyForm({
  initial,
  readOnly,
}: {
  initial: Values;
  readOnly: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: initial,
  });

  const onSubmit = async (values: Values) => {
    const result = await saveCompanySettings(values);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    reset(values);
    toast.success("Company settings saved", {
      description: "The name is now shown wherever the application identifies the company.",
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid max-w-2xl gap-4" noValidate>
      <Section
        title="Company"
        description="The one genuinely global setting: read in the app shell header, on documents, and in the landing page metadata."
      >
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="companyName">Company name</FieldLabel>
            <Input id="companyName" {...register("companyName")} aria-invalid={!!errors.companyName} disabled={readOnly} />
            <FieldError errors={[errors.companyName]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="companyAddress">Trading address</FieldLabel>
            <Textarea
              id="companyAddress"
              rows={2}
              {...register("companyAddress")}
              aria-invalid={!!errors.companyAddress}
              disabled={readOnly}
            />
            <FieldDescription>The registered address used when the company identifies itself.</FieldDescription>
            <FieldError errors={[errors.companyAddress]} />
          </Field>
        </div>
      </Section>

      {!readOnly && (
        <div>
          <Button type="submit" size="sm" className="h-8" disabled={isSubmitting || !isDirty}>
            <Save className="size-3.5" aria-hidden />
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}
