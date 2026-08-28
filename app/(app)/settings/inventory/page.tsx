import type { Metadata } from "next";

import { Section } from "@/components/record/field-grid";
import {
  SettingNumber,
  SettingRow,
  SettingSelect,
  SettingToggle,
} from "@/components/settings/setting-row";
import { getRole } from "@/lib/auth/session";
import { isReadOnly } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Inventory rules",
  description: "The thresholds and policies that govern stock behaviour.",
};

const VALUATION = {
  avco: "Average cost (AVCO)",
  fifo: "First in, first out (FIFO)",
};

const ALLOCATION = {
  fefo: "First expired, first out (FEFO)",
  fifo: "First in, first out (FIFO)",
  nearest: "Nearest bin to despatch",
};

export default async function InventorySettingsPage() {
  const role = await getRole();
  const readOnly = isReadOnly(role, "settings");

  return (
    <div className="grid gap-4">
      <Section
        title="Stock rules"
        description="These decide what the system will and will not let happen to a quantity."
        contentClassName="p-0"
      >
        <SettingRow
          label="Allow negative stock"
          description="Whether a quantity can be driven below zero."
          impact="Leaving this off means a pick or an adjustment is blocked rather than silently creating a negative balance that someone has to unpick later."
          readOnly={readOnly}
        >
          <SettingToggle id="negative-stock" defaultChecked={false} label="Allow negative stock" readOnly={readOnly} />
        </SettingRow>

        <SettingRow
          label="Reserve stock on order confirmation"
          description="Confirmed sales orders take their quantity out of available-to-promise immediately."
          impact="Turning this off means two orders can be promised the same unit."
          readOnly={readOnly}
        >
          <SettingToggle id="reserve-on-confirm" defaultChecked label="Reserve on confirmation" readOnly={readOnly} />
        </SettingRow>

        <SettingRow
          label="Allow backorders"
          description="Accept an order for more than is available and hold the shortfall as open demand."
          readOnly={readOnly}
        >
          <SettingToggle id="backorders" defaultChecked label="Allow backorders" readOnly={readOnly} />
        </SettingRow>

        <SettingRow
          label="Allocation strategy"
          description="Which units a pick takes when the SKU sits in more than one place."
          impact="FEFO is the right default for anything with an expiry date — it puts the oldest stock out first, which is what keeps write-offs down."
          readOnly={readOnly}
        >
          <SettingSelect
            id="allocation"
            options={ALLOCATION}
            defaultValue="fefo"
            label="Allocation strategy"
            width="20rem"
            readOnly={readOnly}
          />
        </SettingRow>
      </Section>

      <Section
        title="Thresholds"
        description="Where the system starts flagging, escalating or blocking."
        contentClassName="p-0"
      >
        <SettingRow
          label="Critical stock threshold"
          description="Below this share of the reorder point, a SKU is Critical rather than Low."
          readOnly={readOnly}
        >
          <SettingNumber
            id="critical-threshold"
            defaultValue={40}
            label="Critical stock threshold"
            suffix="% of reorder point"
            max={100}
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Overstock threshold"
          description="Above this multiple of the reorder point, a SKU is flagged as overstocked."
          impact="Overstock is not an error — it is capital sitting still, which is why it gets its own view rather than a warning."
          readOnly={readOnly}
        >
          <SettingNumber
            id="overstock-threshold"
            defaultValue={6}
            label="Overstock threshold"
            suffix="× reorder point"
            min={2}
            max={20}
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Adjustment approval threshold"
          description="Adjustments moving more than this value route to an inventory manager."
          impact="Set too high and write-offs go unreviewed; too low and the approval queue becomes noise nobody reads."
          readOnly={readOnly}
        >
          <SettingNumber
            id="adjustment-threshold"
            defaultValue={500}
            label="Adjustment approval threshold"
            suffix="USD"
            step={50}
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Count variance tolerance"
          description="Variance beyond this many units requires a recount before the count can be submitted."
          readOnly={readOnly}
        >
          <SettingNumber
            id="count-tolerance"
            defaultValue={8}
            label="Count variance tolerance"
            suffix="units"
            min={1}
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Expiry warning window"
          description="Lots reaching their expiry date within this window appear in the Expiring view."
          readOnly={readOnly}
        >
          <SettingNumber
            id="expiry-window"
            defaultValue={30}
            label="Expiry warning window"
            suffix="days"
            min={1}
            max={365}
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Dead stock threshold"
          description="Stock with no movement for this long is reported as dead."
          readOnly={readOnly}
        >
          <SettingNumber
            id="dead-stock"
            defaultValue={180}
            label="Dead stock threshold"
            suffix="days"
            min={30}
            step={30}
            readOnly={readOnly}
          />
        </SettingRow>
      </Section>

      <Section
        title="Valuation"
        description="How stock is costed for reporting and for the balance sheet."
        contentClassName="p-0"
      >
        <SettingRow
          label="Valuation method"
          description="The method used wherever a single stock value is reported."
          impact="Changing this changes the reported value of the same physical stock. Finance normally sets it once and leaves it."
          readOnly={readOnly}
        >
          <SettingSelect
            id="valuation-method"
            options={VALUATION}
            defaultValue="avco"
            label="Valuation method"
            width="18rem"
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Include damaged stock in valuation"
          description="Whether quarantined and damaged units carry value."
          impact="Excluding them writes the loss off at the point of damage rather than at disposal."
          readOnly={readOnly}
        >
          <SettingToggle id="value-damaged" defaultChecked={false} label="Value damaged stock" readOnly={readOnly} />
        </SettingRow>

        <SettingRow
          label="Include in-transit stock"
          description="Stock despatched from one site and not yet received at the other."
          impact="It is owned either way — excluding it makes the total dip every time a transfer is in flight."
          readOnly={readOnly}
        >
          <SettingToggle id="value-transit" defaultChecked label="Value in-transit stock" readOnly={readOnly} />
        </SettingRow>
      </Section>
    </div>
  );
}
