import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="p-6">
      <div className="rounded-lg border bg-surface">
        <EmptyState
          headingLevel={1}
          icon={FileQuestion}
          title="That record does not exist"
          description="The SKU, order number or reference in the address could not be found. It may have been archived, or the link may be out of date."
          action={
            <Button size="sm" render={<Link href="/dashboard" />}>
              Back to dashboard
            </Button>
          }
          secondary={
            <Button variant="outline" size="sm" render={<Link href="/inventory/products" />}>
              Browse products
            </Button>
          }
        />
      </div>
    </div>
  );
}
