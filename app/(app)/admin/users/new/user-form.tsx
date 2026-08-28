"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Send, TriangleAlert } from "lucide-react";
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
import { ROLES } from "@/lib/auth/permissions";
import type { Role } from "@/lib/types";

const NO_SITE = "—all—";

const DEPARTMENTS = [
  "Operations",
  "Warehouse",
  "Purchasing",
  "Sales",
  "Finance",
  "IT",
  "Compliance",
];

const schema = z.object({
  name: z.string().min(2, "Enter the person's full name."),
  email: z.string().email("An invitation is sent here, so it has to be right."),
  role: z.string().min(1),
  department: z.string().min(1),
  warehouseId: z.string(),
  phone: z.string().min(7, "A phone number is needed for two-factor recovery."),
});

export type UserFormValues = z.infer<typeof schema>;

/**
 * Inviting someone is a permission decision, not an administrative one — the
 * role picked here decides what they can see and sign off from their first
 * sign-in, so the consequence is spelled out next to the choice.
 */
export function UserForm({ sites }: { sites: { id: string; label: string }[] }) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      email: "",
      role: "warehouse-staff",
      department: "Warehouse",
      warehouseId: sites[0]?.id ?? NO_SITE,
      phone: "",
    },
  });

  const role = watch("role") as Role;
  const meta = ROLES.find((r) => r.id === role);
  const siteLabels = React.useMemo(
    () => ({ [NO_SITE]: "Every site", ...Object.fromEntries(sites.map((s) => [s.id, s.label])) }),
    [sites],
  );
  const roleLabels = React.useMemo(
    () => Object.fromEntries(ROLES.map((r) => [r.id, r.label])),
    [],
  );

  const onSubmit = (values: UserFormValues) => {
    toast.success(`Invitation sent to ${values.email}`, {
      description: `${values.name} joins as ${
        ROLES.find((r) => r.id === values.role)?.label ?? values.role
      }. The link expires in 7 days; until they accept, the account shows as invited.`,
    });
    router.push("/admin/users");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid max-w-3xl gap-4" noValidate>
      <Section title="Person" description="Who is being invited, and how they are reached.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="name">Full name</FieldLabel>
            <Input id="name" {...register("name")} aria-invalid={!!errors.name} />
            <FieldError errors={[errors.name]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="email">Work email</FieldLabel>
            <Input id="email" type="email" {...register("email")} aria-invalid={!!errors.email} />
            <FieldDescription>The invitation and every approval notice go here.</FieldDescription>
            <FieldError errors={[errors.email]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input id="phone" {...register("phone")} aria-invalid={!!errors.phone} />
            <FieldDescription>Used for two-factor recovery, not for marketing.</FieldDescription>
            <FieldError errors={[errors.phone]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="department">Department</FieldLabel>
            <Controller
              control={control}
              name="department"
              render={({ field }) => (
                <Select
                  items={Object.fromEntries(DEPARTMENTS.map((d) => [d, d]))}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="department">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
      </Section>

      <Section title="Access" description="What this account can do on its first day.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="role">Role</FieldLabel>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select items={roleLabels} value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>{meta?.summary}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="warehouseId">Home site</FieldLabel>
            <Controller
              control={control}
              name="warehouseId"
              render={({ field }) => (
                <Select items={siteLabels} value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="warehouseId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SITE}>Every site</SelectItem>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>
              Handheld screens open on this site, and its queues are what they see first.
            </FieldDescription>
          </Field>
        </div>

        {role === "super-admin" && (
          <div className="mt-3 flex items-start gap-2.5 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2.5 text-caption text-status-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Super Admin can change permissions, revoke keys and delete records anywhere in the
              system, including for other administrators. Give it only to people who need to
              administer the platform itself.
            </p>
          </div>
        )}
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="h-8" disabled={isSubmitting}>
          <Send className="size-3.5" aria-hidden />
          Send invitation
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => router.push("/admin/users")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
