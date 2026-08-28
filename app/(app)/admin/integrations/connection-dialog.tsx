"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FREQUENCIES: Record<string, string> = {
  "5m": "Every 5 minutes",
  "1h": "Hourly",
  "6h": "Every 6 hours",
  nightly: "Nightly at 23:00",
  manual: "Manual only",
};

const DIRECTIONS: Record<string, string> = {
  push: "Stockpile → them",
  pull: "Them → Stockpile",
  both: "Two-way",
};

/**
 * Connecting and configuring are the same conversation — endpoint, credential,
 * how often, which way — so they are one dialog with a different verb. The
 * credential is write-only: it is never read back into the field, because a
 * secret rendered into a page is a secret in somebody's browser history.
 */
export function ConnectionDialog({
  name,
  vendor,
  connected,
}: {
  name: string;
  vendor: string;
  connected: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [endpoint, setEndpoint] = React.useState(
    `https://api.${vendor.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com/v2`,
  );
  const [secret, setSecret] = React.useState("");
  const [frequency, setFrequency] = React.useState(connected ? "1h" : "nightly");
  const [direction, setDirection] = React.useState(connected ? "both" : "pull");
  const [backfill, setBackfill] = React.useState(!connected);

  const missingSecret = !connected && secret.trim().length < 8;

  const save = () => {
    if (missingSecret) return;
    toast.success(connected ? `${name} updated` : `${name} connected`, {
      description: `${DIRECTIONS[direction]}, ${FREQUENCIES[frequency].toLowerCase()}.${
        backfill ? " A first full sync starts now and may take a few minutes." : ""
      }`,
    });
    setOpen(false);
    setSecret("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={connected ? "outline" : "default"} size="sm" className="h-7" />
        }
      >
        {connected ? "Configure" : "Connect"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {connected ? `Configure ${name}` : `Connect ${name}`}
          </DialogTitle>
          <DialogDescription>
            {connected
              ? "Changes take effect on the next cycle. The connector finishes whatever it is doing first."
              : `Stockpile authenticates against ${vendor} with a key you generate there. It is stored encrypted and never shown again.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="endpoint">API endpoint</FieldLabel>
            <Input
              id="endpoint"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="text-code"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="secret">
              {connected ? "Replace the API key" : "API key"}
            </FieldLabel>
            <Input
              id="secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={connected ? "Leave blank to keep the current key" : "Paste the key"}
              aria-invalid={missingSecret && secret.length > 0}
            />
            <FieldDescription>
              {connected
                ? "The existing key keeps working until a new one is saved."
                : "At least 8 characters. It is stored encrypted and never displayed again."}
            </FieldDescription>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="frequency">Sync frequency</FieldLabel>
              <Select
                items={FREQUENCIES}
                value={frequency}
                onValueChange={(v) => setFrequency(v ?? frequency)}
              >
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCIES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="direction">Direction</FieldLabel>
              <Select
                items={DIRECTIONS}
                value={direction}
                onValueChange={(v) => setDirection(v ?? direction)}
              >
                <SelectTrigger id="direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DIRECTIONS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <label className="flex items-start gap-3 rounded-md border bg-surface-sunken px-3 py-2.5">
            <Switch checked={backfill} onCheckedChange={setBackfill} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="text-body font-medium">Backfill history now</span>
              <span className="text-caption text-muted-foreground">
                Pulls everything that exists today rather than waiting for the next change. Slower,
                but the two systems agree from the start.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" size="sm" className="h-8">
                Cancel
              </Button>
            }
          />
          <Button size="sm" className="h-8" onClick={save} disabled={missingSecret}>
            {connected ? "Save changes" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
