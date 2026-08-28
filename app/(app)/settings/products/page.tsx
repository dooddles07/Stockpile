import type { Metadata } from "next";

import { Section } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import {
  SettingRow,
  SettingSelect,
  SettingText,
  SettingToggle,
} from "@/components/settings/setting-row";
import { StatusBadge } from "@/components/status/status-badge";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { isReadOnly } from "@/lib/auth/permissions";
import { qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Product settings",
  description: "SKU format, barcodes and units of measure.",
};

const BARCODE_FORMATS = {
  ean13: "EAN-13",
  upca: "UPC-A",
  code128: "Code 128",
  gs1: "GS1-128",
};

const SKU_MODES = {
  category: "Category prefix + sequence",
  manual: "Entered by hand",
  sequence: "Plain sequence",
};

const UNITS = [
  { unit: "unit", label: "Unit", note: "A single item" },
  { unit: "box", label: "Box", note: "A packed carton of a fixed count" },
  { unit: "case", label: "Case", note: "A shipping case, usually several boxes" },
  { unit: "pack", label: "Pack", note: "A retail multi-pack" },
  { unit: "roll", label: "Roll", note: "Continuous media — labels, wrap, ribbon" },
  { unit: "pair", label: "Pair", note: "Two items sold together" },
  { unit: "bay", label: "Bay", note: "A racking or shelving bay" },
  { unit: "kit", label: "Kit", note: "A pre-assembled set" },
  { unit: "set", label: "Set", note: "Items sold only as a group" },
  { unit: "drum", label: "Drum", note: "Bulk liquid container" },
];

export default async function ProductSettingsPage() {
  const role = await getRole();
  const readOnly = isReadOnly(role, "settings");

  const usage = new Map<string, number>();
  for (const p of db.products) {
    usage.set(p.unit, (usage.get(p.unit) ?? 0) + 1);
  }

  return (
    <div className="grid gap-4">
      <Section
        title="SKU format"
        description="How new product codes are generated."
        contentClassName="p-0"
      >
        <SettingRow
          label="SKU generation"
          description="What a suggested SKU looks like when adding a product."
          impact="SKUs are scanned and read aloud. A format that collides or reads ambiguously costs time on the floor every day."
          readOnly={readOnly}
        >
          <SettingSelect
            id="sku-mode"
            options={SKU_MODES}
            defaultValue="category"
            label="SKU generation"
            width="20rem"
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow label="SKU pattern" description="Tokens are replaced when a SKU is generated." readOnly={readOnly}>
          <SettingText
            id="sku-pattern"
            defaultValue="{CATEGORY}-{TYPE}-{SEQ}"
            label="SKU pattern"
            mono
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Enforce uppercase"
          description="SKUs are stored and displayed in uppercase only."
          impact="Prevents BCL-scn-104 and BCL-SCN-104 becoming two products."
          readOnly={readOnly}
        >
          <SettingToggle id="sku-uppercase" defaultChecked label="Enforce uppercase SKUs" readOnly={readOnly} />
        </SettingRow>

        <SettingRow
          label="Block SKU reuse"
          description="A SKU freed by archiving a product cannot be assigned to a new one."
          impact="Reusing a SKU makes historical movements point at the wrong product."
          readOnly={readOnly}
        >
          <SettingToggle id="sku-reuse" defaultChecked label="Block SKU reuse" readOnly={readOnly} />
        </SettingRow>
      </Section>

      <Section title="Barcodes" description="How products are identified at a scanner." contentClassName="p-0">
        <SettingRow label="Default barcode format" readOnly={readOnly}>
          <SettingSelect
            id="barcode-format"
            options={BARCODE_FORMATS}
            defaultValue="ean13"
            label="Default barcode format"
            width="14rem"
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Require a barcode before receiving"
          description="A product cannot be booked in until it has a scannable code."
          readOnly={readOnly}
        >
          <SettingToggle
            id="require-barcode"
            defaultChecked={false}
            label="Require barcode before receiving"
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Auto-assign on first receipt"
          description="Generate a barcode when a product without one is first booked in."
          readOnly={readOnly}
        >
          <SettingToggle id="auto-barcode" defaultChecked label="Auto-assign barcode" readOnly={readOnly} />
        </SettingRow>
      </Section>

      <Section
        title="Units of measure"
        description="What one unit of stock means. Changing a product's unit does not convert its recorded quantity."
        contentClassName="p-0"
      >
        <SimpleTable
          rows={UNITS}
          getRowId={(u) => u.unit}
          columns={[
            {
              key: "unit",
              header: "Unit",
              cell: (u) => <span className="text-code font-medium">{u.unit}</span>,
            },
            { key: "label", header: "Label", cell: (u) => u.label },
            {
              key: "note",
              header: "Meaning",
              cell: (u) => <span className="text-muted-foreground">{u.note}</span>,
            },
            {
              key: "usage",
              header: "Products",
              align: "right",
              cell: (u) => {
                const count = usage.get(u.unit) ?? 0;
                return count > 0 ? (
                  qty(count)
                ) : (
                  <span className="text-muted-foreground">unused</span>
                );
              },
            },
            {
              key: "status",
              header: "Status",
              cell: (u) =>
                (usage.get(u.unit) ?? 0) > 0 ? (
                  <StatusBadge label="In use" tone="success" />
                ) : (
                  <StatusBadge label="Available" tone="neutral" />
                ),
            },
          ]}
        />
      </Section>
    </div>
  );
}
