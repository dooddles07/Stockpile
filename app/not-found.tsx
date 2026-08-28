import Link from "next/link";
import { Boxes, FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Root 404 — a URL that matches no route at all.
 *
 * This one renders outside the app shell (the sidebar lives under the `(app)`
 * layout, which never matched), so it carries its own branding rather than
 * dropping the reader onto an unstyled page.
 */
export default function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <Link href="/dashboard" className="mb-8 flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Boxes className="size-4.5" aria-hidden />
        </span>
        <span className="text-section font-semibold">Stockpile</span>
      </Link>

      <span className="mb-4 flex size-11 items-center justify-center rounded-lg border bg-surface-sunken">
        <FileQuestion className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <h1 className="text-page-title">Page not found</h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
        Nothing lives at this address. The link may be out of date, or the page may have moved when
        the workspace was reorganised.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" render={<Link href="/dashboard" />}>
          Go to dashboard
        </Button>
        <Button variant="outline" size="sm" render={<Link href="/inventory/products" />}>
          Browse products
        </Button>
      </div>
    </div>
  );
}
