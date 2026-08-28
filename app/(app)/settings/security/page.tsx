import type { Metadata } from "next";
import { Monitor, ShieldCheck } from "lucide-react";

import { Section } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import {
  SettingNumber,
  SettingRow,
  SettingSelect,
  SettingToggle,
} from "@/components/settings/setting-row";
import { StatusBadge } from "@/components/status/status-badge";
import { MeterBar } from "@/components/status/meter-bar";
import { users as allUsers } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { isReadOnly } from "@/lib/auth/permissions";
import { percent, plural, qty, relative } from "@/lib/format";
import { ROLE_BY_ID } from "@/lib/auth/permissions";
import { ActionButton } from "@/components/actions/action-button";

export const metadata: Metadata = {
  title: "Security settings",
  description: "Password policy, two-factor enforcement and active sessions.",
};

const TWO_FACTOR_MODES = {
  optional: "Optional",
  admins: "Required for admins and approvers",
  all: "Required for everyone",
};

const PASSWORD_STRENGTH = {
  standard: "Standard — 8 characters",
  strong: "Strong — 12 characters, mixed case and a number",
  strict: "Strict — 14 characters, mixed case, number and symbol",
};

export default async function SecuritySettingsPage() {
  const role = await getRole();
  const readOnly = isReadOnly(role, "settings");

  const users = await allUsers();
  const withTwoFactor = users.filter((u) => u.twoFactor);
  const coverage = users.length > 0 ? withTwoFactor.length / users.length : 0;

  // Recent logins stand in for active sessions — the most recent login per
  // user is the closest thing this dataset has to a live session.
  const sessions = users
    .filter((u) => u.lastLoginAt && u.status === "active")
    .sort((a, b) => (b.lastLoginAt ?? "").localeCompare(a.lastLoginAt ?? ""))
    .slice(0, 12);

  const withoutTwoFactor = users.filter((u) => !u.twoFactor && u.status === "active");

  return (
    <div className="grid gap-4">
      <Section title="Authentication" description="How people prove who they are." contentClassName="p-0">
        <SettingRow
          label="Two-factor authentication"
          description="Who must present a second factor at sign-in."
          impact="Anyone who can approve a purchase order or adjust stock can move money. Requiring a second factor for approvers is the single highest-value setting on this page."
          readOnly={readOnly}
        >
          <SettingSelect
            id="two-factor"
            options={TWO_FACTOR_MODES}
            defaultValue="admins"
            label="Two-factor authentication"
            width="22rem"
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Password strength"
          description="Minimum requirements for a new password."
          readOnly={readOnly}
        >
          <SettingSelect
            id="password-strength"
            options={PASSWORD_STRENGTH}
            defaultValue="strong"
            label="Password strength"
            width="26rem"
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Password expiry"
          description="Force a change after this many days. Zero disables expiry."
          impact="Frequent forced rotation tends to produce weaker, more predictable passwords, not stronger ones."
          readOnly={readOnly}
        >
          <SettingNumber
            id="password-expiry"
            defaultValue={0}
            label="Password expiry"
            suffix="days"
            max={365}
            step={30}
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Block reuse of recent passwords"
          description="A new password cannot match the last five."
          readOnly={readOnly}
        >
          <SettingToggle id="password-reuse" defaultChecked label="Block password reuse" readOnly={readOnly} />
        </SettingRow>
      </Section>

      <Section title="Sessions" description="How long access lasts without re-authenticating." contentClassName="p-0">
        <SettingRow
          label="Session timeout"
          description="Sign out after this long without activity."
          impact="Warehouse terminals are shared. A long timeout there means the next person inherits the last person's permissions."
          readOnly={readOnly}
        >
          <SettingNumber
            id="session-timeout"
            defaultValue={480}
            label="Session timeout"
            suffix="minutes"
            min={15}
            max={10080}
            step={15}
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Shared terminal timeout"
          description="A shorter timeout for devices flagged as shared."
          readOnly={readOnly}
        >
          <SettingNumber
            id="shared-timeout"
            defaultValue={20}
            label="Shared terminal timeout"
            suffix="minutes"
            min={5}
            max={120}
            step={5}
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Single session per user"
          description="Signing in on a new device ends the previous session."
          readOnly={readOnly}
        >
          <SettingToggle
            id="single-session"
            defaultChecked={false}
            label="Single session per user"
            readOnly={readOnly}
          />
        </SettingRow>

        <SettingRow
          label="Re-authenticate for destructive actions"
          description="Deleting a record or changing permissions asks for the password again."
          readOnly={readOnly}
        >
          <SettingToggle
            id="reauth-destructive"
            defaultChecked
            label="Re-authenticate for destructive actions"
            readOnly={readOnly}
          />
        </SettingRow>
      </Section>

      <Section
        title="Two-factor coverage"
        description="Who is protected, and who is not."
        actions={
          !readOnly && (
            <ActionButton
              variant="outline" size="sm" className="h-7"
              feedback="Enrolment prompt sent"
              detail="Everyone without two-factor is asked to enrol at their next sign-in."
            >
              Prompt the rest
            </ActionButton>
          )
        }
      >
        <div className="grid gap-4">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-caption text-muted-foreground">Coverage</span>
              <span className="tabular text-[15px] font-bold" data-numeric>
                {percent(coverage, 0)}
              </span>
            </div>
            <MeterBar
              value={coverage}
              tone={coverage >= 0.9 ? "success" : coverage >= 0.6 ? "warning" : "danger"}
              className="mt-2"
              label={`${withTwoFactor.length} of ${users.length} users have two-factor enabled`}
            />
            <p className="mt-1.5 text-caption text-muted-foreground">
              {plural(withTwoFactor.length, "user")} of {qty(users.length)} enrolled ·{" "}
              {plural(withoutTwoFactor.length, "active user")} without it
            </p>
          </div>

          {withoutTwoFactor.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-md border border-status-warning-border bg-status-warning-bg p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
              <p className="text-caption leading-relaxed text-status-warning/90">
                {plural(
                  withoutTwoFactor.filter((u) => ["super-admin", "inventory-manager", "purchasing-manager"].includes(u.role)).length,
                  "user",
                )}{" "}
                without two-factor can approve spend or change stock. Those are the accounts worth
                enrolling first.
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Recent sessions"
        description="The most recent sign-in per active user, with the device it came from."
        actions={<Monitor className="size-4 text-muted-foreground" aria-hidden />}
        contentClassName="p-0"
      >
        <SimpleTable
          rows={sessions}
          getRowId={(u) => u.id}
          columns={[
            {
              key: "user",
              header: "User",
              cell: (u) => (
                <span className="grid gap-0.5">
                  <span className="font-medium">{u.name}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{u.email}</span>
                </span>
              ),
            },
            {
              key: "role",
              header: "Role",
              hideOnMobile: true,
              cell: (u) => ROLE_BY_ID.get(u.role)?.label ?? u.role,
            },
            {
              key: "twoFactor",
              header: "2FA",
              cell: (u) =>
                u.twoFactor ? (
                  <StatusBadge label="Enabled" tone="success" />
                ) : (
                  <StatusBadge label="Off" tone="warning" />
                ),
            },
            {
              key: "lastLogin",
              header: "Signed in",
              align: "right",
              cell: (u) => (
                <span className="text-muted-foreground">
                  {u.lastLoginAt ? relative(u.lastLoginAt) : "never"}
                </span>
              ),
            },
            {
              key: "action",
              header: "",
              align: "right",
              cell: (u) =>
                readOnly ? null : (
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    tone="warning"
                    feedback={`${u.name} signed out`}
                    detail="Any unsaved work in their open tabs is lost."
                    confirm={{
                      title: `End ${u.name}'s session?`,
                      body: "They are signed out of every device straight away and have to sign in again. Unsaved work in their open tabs is lost.",
                      action: "End session",
                    }}
                  >
                    End session
                  </ActionButton>
                ),
            },
          ]}
        />
      </Section>
    </div>
  );
}
