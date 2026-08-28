"use client";

import * as React from "react";
import { Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const KINDS: Record<string, string> = {
  datasheet: "Specification sheet",
  certificate: "Safety or compliance certificate",
  msds: "Material safety data sheet",
  drawing: "Technical drawing",
  supplier: "Supplier paperwork",
  other: "Other",
};

const MAX_MB = 20;

/**
 * Attaching paperwork to a record.
 *
 * The file is checked before it is accepted rather than after: a 40 MB scan
 * rejected at the end of an upload is the thing that makes people email the
 * document to a colleague instead.
 */
export function UploadDialog({
  recordLabel,
  label = "Upload a document",
  size = "sm",
}: {
  recordLabel: string;
  label?: string;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [kind, setKind] = React.useState("datasheet");
  const [title, setTitle] = React.useState("");

  const tooBig = file !== null && file.size > MAX_MB * 1024 * 1024;
  const ready = file !== null && !tooBig;

  const reset = () => {
    setFile(null);
    setKind("datasheet");
    setTitle("");
  };

  const upload = () => {
    if (!file || tooBig) return;
    toast.success(`${title.trim() || file.name} attached`, {
      description: `${KINDS[kind]} · ${(file.size / 1024).toFixed(0)} KB · filed against ${recordLabel}.`,
    });
    setOpen(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button size={size} />}>
        <Upload className="size-3.5" aria-hidden />
        {label}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Attach a document</DialogTitle>
          <DialogDescription>
            Anyone who can see {recordLabel} can open what is attached to it. Do not attach anything
            with pricing you would not show the warehouse floor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="doc-file">File</FieldLabel>
            <Input
              id="doc-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              aria-invalid={tooBig}
            />
            <FieldDescription>
              {file ? (
                tooBig ? (
                  <span className="text-status-danger">
                    {(file.size / 1024 / 1024).toFixed(1)} MB is over the {MAX_MB} MB limit. Compress
                    it or link to it instead.
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Paperclip className="size-3" aria-hidden />
                    {file.name} · {(file.size / 1024).toFixed(0)} KB
                  </span>
                )
              ) : (
                `PDF, image, Word, Excel or CSV, up to ${MAX_MB} MB.`
              )}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="doc-kind">Type</FieldLabel>
            <Select items={KINDS} value={kind} onValueChange={(v) => setKind(v ?? kind)}>
              <SelectTrigger id="doc-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KINDS).map(([value, text]) => (
                  <SelectItem key={value} value={value}>
                    {text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="doc-title">Title</FieldLabel>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={file ? file.name : "Leave blank to use the file name"}
            />
            <FieldDescription>What the person looking for this would search for.</FieldDescription>
          </Field>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" className="h-8">Cancel</Button>} />
          <Button size="sm" className="h-8" onClick={upload} disabled={!ready}>
            Attach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
