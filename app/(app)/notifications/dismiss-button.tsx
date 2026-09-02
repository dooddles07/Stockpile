"use client";

import * as React from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { dismissNotificationAction } from "./actions";
import { cn } from "@/lib/utils";

/**
 * The dismiss control on one notification row. A dismissed notification leaves
 * every feed, so on success the server revalidation drops it on the next
 * render; the row is only removed once the write lands.
 */
export function DismissButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const dismiss = () => {
    startTransition(async () => {
      const result = await dismissNotificationAction({ id });
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={dismiss}
      disabled={pending}
      aria-label={`Dismiss: ${label}`}
      className={cn(
        "flex w-11 shrink-0 items-center justify-center border-l text-muted-foreground transition-colors",
        "hover:bg-surface-hover hover:text-foreground disabled:opacity-50",
      )}
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}
