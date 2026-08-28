/**
 * Sales return detail.
 *
 * A return document is the same record either way — the page already branches
 * on `kind` for counterparty, stock direction and permissions, so both routes
 * render it rather than keeping two copies in step by hand.
 */
export { default, generateMetadata } from "@/app/(app)/purchasing/returns/[id]/page";
