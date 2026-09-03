import type { Metadata } from "next";

import { getRole } from "@/lib/auth/session";
import { isReadOnly } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db/client";
import { companySettings } from "@/lib/domain/settings";
import { CompanyForm } from "./company-form";

export const metadata: Metadata = {
  title: "Company settings",
  description: "The company name and trading address, read wherever the application names the company.",
};

export default async function CompanySettingsPage() {
  const [role, current] = await Promise.all([getRole(), companySettings(getDb())]);
  const readOnly = isReadOnly(role, "settings");

  return <CompanyForm initial={current} readOnly={readOnly} />;
}
