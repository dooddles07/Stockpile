import type { Metadata } from "next";
import { Package } from "lucide-react";

import { Section } from "@/components/record/field-grid";
import {
  SettingRow,
  SettingSelect,
  SettingText,
} from "@/components/settings/setting-row";
import { getRole } from "@/lib/auth/session";
import { isReadOnly } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { plural } from "@/lib/format";

export const metadata: Metadata = {
  title: "Company settings",
  description: "Company identity and defaults.",
};

const CURRENCIES = { USD: "US Dollar (USD)", EUR: "Euro (EUR)", GBP: "Pound Sterling (GBP)" };
const TIMEZONES = {
  "America/New_York": "Eastern (America/New_York)",
  "America/Chicago": "Central (America/Chicago)",
  "America/Los_Angeles": "Pacific (America/Los_Angeles)",
  UTC: "UTC",
};
const WEEK_START = { monday: "Monday", sunday: "Sunday" };

export default async function CompanySettingsPage() {
  const role = await getRole();
  const readOnly = isReadOnly(role, "settings");

  return (
    <div className="grid gap-4">
      <Section title="Company profile" description="Appears on documents sent to suppliers and customers." contentClassName="p-0">
        <SettingRow label="Company name" readOnly={readOnly}>
          <SettingText id="company-name" defaultValue="Stockpile" label="Company name" readOnly={readOnly} />
        </SettingRow>
        <SettingRow label="Legal entity" description="The registered name used on invoices and purchase orders." readOnly={readOnly}>
          <SettingText
            id="legal-name"
            defaultValue="Stockpile Distribution Inc."
            label="Legal entity"
            readOnly={readOnly}
          />
        </SettingRow>
        <SettingRow label="Registered address" readOnly={readOnly}>
          <SettingText
            id="address"
            defaultValue="4400 Corporate Exchange Blvd, Columbus, Ohio"
            label="Registered address"
            width="24rem"
            readOnly={readOnly}
          />
        </SettingRow>
        <SettingRow label="Tax identifier" readOnly={readOnly}>
          <SettingText id="tax-id" defaultValue="US-84-2917446" label="Tax identifier" mono readOnly={readOnly} />
        </SettingRow>
        <SettingRow label="Support email" readOnly={readOnly}>
          <SettingText id="support-email" defaultValue="operations@stockpile.co" label="Support email" readOnly={readOnly} />
        </SettingRow>
      </Section>

      <Section title="Regional defaults" description="Applied wherever a site does not override them." contentClassName="p-0">
        <SettingRow
          label="Reporting currency"
          description="Every value in analytics and reporting is presented in this currency."
          impact="Changing this does not convert historical figures — it changes how they are labelled."
          readOnly={readOnly}
        >
          <SettingSelect
            id="currency"
            options={CURRENCIES}
            defaultValue="USD"
            label="Reporting currency"
            readOnly={readOnly}
          />
        </SettingRow>
        <SettingRow
          label="Default timezone"
          description="Used for scheduled reports and automation windows."
          readOnly={readOnly}
        >
          <SettingSelect
            id="timezone"
            options={TIMEZONES}
            defaultValue="America/New_York"
            label="Default timezone"
            width="18rem"
            readOnly={readOnly}
          />
        </SettingRow>
        <SettingRow label="Week starts on" description="Affects weekly grouping in every chart." readOnly={readOnly}>
          <SettingSelect
            id="week-start"
            options={WEEK_START}
            defaultValue="monday"
            label="Week starts on"
            width="10rem"
            readOnly={readOnly}
          />
        </SettingRow>
      </Section>

      <Section title="Workspace">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Package className="size-4" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium">Stockpile North America</p>
            <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">
              {plural(db.warehouses.length, "site")} · {plural(db.users.length, "user")} ·{" "}
              {plural(db.products.length, "SKU")}. Other workspaces hold their own stock, users and
              settings; nothing is shared between them except the product catalogue.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
