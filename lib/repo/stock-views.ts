/**
 * The stock-levels saved views.
 *
 * A leaf module with no data or server-only dependency, so the client
 * `<StockTable>` can import `STOCK_VIEWS` without pulling in the database
 * client. `inventory.ts` re-exports these for server callers.
 */

export const STOCK_VIEWS = {
  all: {
    label: "All stock",
    description: "Every stock record across all warehouses, at every site and bin.",
  },
  "low-stock": {
    label: "Low stock",
    description:
      "SKUs whose total available quantity has fallen below their reorder point, shown per location so you can see where the remaining stock is.",
  },
  critical: { label: "Critical", description: "Under 40% of the reorder point." },
  "out-of-stock": { label: "Out of stock", description: "Nothing available to allocate." },
  overstock: { label: "Overstock", description: "More than 6× the reorder point — capital sitting still." },
  expiring: { label: "Expiring", description: "Lots reaching their expiry date within 30 days." },
} as const;

export type StockViewKey = keyof typeof STOCK_VIEWS;
