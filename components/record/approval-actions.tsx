"use client";

import { useState } from "react";
import { Check, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * Approve / reject for any document that routes for sign-off.
 *
 * Rejection requires a reason: the person who raised the request has to know
 * what to change, and the reason lands in the audit trail either way.
 */
export function ApprovalActions({
  recordLabel,
  summary,
  impact,
}: {
  recordLabel: string;
  summary: string;
  /** The consequence of approving, spelled out. */
  impact: string;
}) {
  const [reason, setReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger render={<Button size="sm" className="h-8" />}>
          <Check className="size-3.5" aria-hidden />
          Approve
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {recordLabel}?</AlertDialogTitle>
            <AlertDialogDescription>{summary}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2.5">
            <p className="text-[13px] font-medium text-status-warning">What this does</p>
            <p className="mt-1 text-caption leading-relaxed text-status-warning/90">{impact}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                toast.success(`${recordLabel} approved`, {
                  description: "The approval is recorded in the audit log with your name and the time.",
                })
              }
            >
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogTrigger render={<Button variant="outline" size="sm" className="h-8" />}>
          <X className="size-3.5" aria-hidden />
          Reject
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {recordLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Nothing is posted to stock. The person who raised it is notified with your reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reject-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What needs to change before this can be approved?"
              rows={3}
            />
            {reason.trim().length === 0 && (
              <p className="text-caption text-muted-foreground">
                A reason is required — a rejection with no explanation just comes straight back.
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReason("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reason.trim().length === 0}
              onClick={() => {
                toast.warning(`${recordLabel} rejected`, { description: reason.trim() });
                setReason("");
                setRejectOpen(false);
              }}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => toast.info("Comment added to the approval thread")}
      >
        <MessageSquare className="size-3.5" aria-hidden />
        Comment
      </Button>
    </>
  );
}
