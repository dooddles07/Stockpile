"use client";

import * as React from "react";
import { Check, Copy, KeyRound, Webhook } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { plural } from "@/lib/format";

const SCOPES = [
  { id: "inventory:read", label: "Read stock and products" },
  { id: "inventory:write", label: "Adjust stock and edit products" },
  { id: "orders:read", label: "Read purchase and sales orders" },
  { id: "orders:write", label: "Create and update orders" },
  { id: "reports:read", label: "Read reports and valuation" },
];

const EXPIRY: Record<string, string> = {
  "90": "90 days",
  "365": "1 year",
  never: "No expiry",
};

/** Mock, but shaped like the real thing — prefix, then 32 characters. */
function mintKey() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `sk_live_${[...bytes].map((b) => alphabet[b % alphabet.length]).join("")}`;
}

/**
 * Key creation is the one moment the secret exists in readable form, so the
 * dialog changes shape after it is minted: the form is replaced by the key and
 * a warning that this is the only time it will be shown.
 */
export function CreateKeyDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>(["inventory:read"]);
  const [expiry, setExpiry] = React.useState("365");
  const [minted, setMinted] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const reset = () => {
    setName("");
    setScopes(["inventory:read"]);
    setExpiry("365");
    setMinted(null);
    setCopied(false);
  };

  const toggle = (id: string) =>
    setScopes((list) => (list.includes(id) ? list.filter((s) => s !== id) : [...list, id]));

  const create = () => {
    if (name.trim().length < 3 || scopes.length === 0) return;
    setMinted(mintKey());
    toast.success(`${name.trim()} created`, {
      description: `${plural(scopes.length, "scope")}, ${EXPIRY[expiry].toLowerCase()}.`,
    });
  };

  const copy = async () => {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted);
      setCopied(true);
    } catch {
      toast.error("Could not reach the clipboard", {
        description: "Select the key and copy it manually.",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" className="h-7" />}>
        <KeyRound className="size-3.5" aria-hidden />
        Create a key
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        {minted ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy the key now</DialogTitle>
              <DialogDescription>
                This is the only time it is shown. Once this dialog closes only the prefix is ever
                displayed again — if it is lost, the key has to be revoked and replaced.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <p className="rounded-md border bg-surface-sunken px-3 py-2.5 text-code text-caption break-all">
                {minted}
              </p>
              <Button variant="outline" size="sm" className="h-8 justify-self-start" onClick={copy}>
                {copied ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
                {copied ? "Copied" : "Copy key"}
              </Button>
            </div>

            <DialogFooter>
              <DialogClose render={<Button size="sm" className="h-8">Done</Button>} />
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create an API key</DialogTitle>
              <DialogDescription>
                A key carries exactly the scopes you tick here. Give each integration its own, so
                revoking one does not take the others down with it.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <Field>
                <FieldLabel htmlFor="key-name">Name</FieldLabel>
                <Input
                  id="key-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Storefront sync"
                  aria-invalid={name.length > 0 && name.trim().length < 3}
                />
                <FieldDescription>
                  Shown in the key list and in the audit log every time it is used.
                </FieldDescription>
              </Field>

              <div className="grid gap-2">
                <FieldLabel>Scopes</FieldLabel>
                {SCOPES.map((scope) => (
                  <label key={scope.id} className="flex items-center gap-2.5 text-body">
                    <Checkbox
                      checked={scopes.includes(scope.id)}
                      onCheckedChange={() => toggle(scope.id)}
                    />
                    <span>{scope.label}</span>
                    <span className="text-code text-caption text-muted-foreground">{scope.id}</span>
                  </label>
                ))}
                {scopes.length === 0 && (
                  <p className="text-caption text-status-danger">
                    A key with no scopes can authenticate but do nothing. Pick at least one.
                  </p>
                )}
              </div>

              <Field>
                <FieldLabel htmlFor="key-expiry">Expires</FieldLabel>
                <Select items={EXPIRY} value={expiry} onValueChange={(v) => setExpiry(v ?? expiry)}>
                  <SelectTrigger id="key-expiry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXPIRY).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  A key that never expires is a key nobody remembers to rotate.
                </FieldDescription>
              </Field>
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="outline" size="sm" className="h-8">Cancel</Button>} />
              <Button
                size="sm"
                className="h-8"
                onClick={create}
                disabled={name.trim().length < 3 || scopes.length === 0}
              >
                Create key
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const EVENTS = [
  "stock.low",
  "stock.adjusted",
  "purchase-order.approved",
  "purchase-order.received",
  "sales-order.shipped",
  "transfer.completed",
  "count.variance",
];

export function AddEndpointDialog() {
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState("https://");
  const [events, setEvents] = React.useState<string[]>(["stock.low"]);

  const valid = /^https:\/\/.+\..+/.test(url) && events.length > 0;

  const toggle = (event: string) =>
    setEvents((list) => (list.includes(event) ? list.filter((e) => e !== event) : [...list, event]));

  const save = () => {
    if (!valid) return;
    toast.success("Endpoint added", {
      description: `${plural(events.length, "event")} will POST to ${
        new URL(url).host
      }. Failed deliveries retry with backoff for 24 hours.`,
    });
    setOpen(false);
    setUrl("https://");
    setEvents(["stock.low"]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-7" />}>
        <Webhook className="size-3.5" aria-hidden />
        Add endpoint
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a webhook endpoint</DialogTitle>
          <DialogDescription>
            Stockpile POSTs a signed JSON body and expects a 2xx within 5 seconds. Anything slower is
            treated as a failure and retried.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="hook-url">Endpoint URL</FieldLabel>
            <Input
              id="hook-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="text-code"
              aria-invalid={url.length > 8 && !/^https:\/\/.+\..+/.test(url)}
            />
            <FieldDescription>HTTPS only — the payload includes stock and order data.</FieldDescription>
          </Field>

          <div className="grid gap-2">
            <FieldLabel>Events</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-2">
              {EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-2.5 text-body">
                  <Checkbox checked={events.includes(event)} onCheckedChange={() => toggle(event)} />
                  <span className="text-code text-caption">{event}</span>
                </label>
              ))}
            </div>
            {events.length === 0 && (
              <p className="text-caption text-status-danger">
                An endpoint subscribed to nothing never fires. Pick at least one event.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" className="h-8">Cancel</Button>} />
          <Button size="sm" className="h-8" onClick={save} disabled={!valid}>
            Add endpoint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
