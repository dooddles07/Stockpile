"use client";

import * as React from "react";
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
} from "@/components/ui/alert-dialog";

interface ActionButtonProps extends React.ComponentProps<typeof Button> {
  /** What the operator is told happened, as a completed operation. */
  feedback: string;
  detail?: string;
  /** Present for anything that cannot be taken back. */
  confirm?: { title: string; body: string; action: string };
  tone?: "success" | "info" | "warning";
}

/**
 * A page-level action that fires and forgets — print, export, resync, revoke.
 *
 * These have no follow-up screen, so the toast is the entire result: it is the
 * only thing that tells the operator the click landed. Anything irreversible
 * asks first, and says what it costs, rather than acting on a single click.
 */
export function ActionButton({
  feedback,
  detail,
  confirm,
  tone = "success",
  children,
  ...props
}: ActionButtonProps) {
  const [open, setOpen] = React.useState(false);

  const fire = () => {
    toast[tone](feedback, detail ? { description: detail } : undefined);
    setOpen(false);
  };

  if (!confirm) {
    return (
      <Button {...props} onClick={fire}>
        {children}
      </Button>
    );
  }

  return (
    <>
      <Button {...props} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={fire}>{confirm.action}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
