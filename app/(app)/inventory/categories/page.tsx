import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { MeterBar } from "@/components/status/meter-bar";
import { StatusBadge } from "@/components/status/status-badge";
import { ProductThumb } from "@/components/product/product-thumb";
import { db } from "@/lib/data/store";
import { healthOf, productRowsSync } from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money, percent, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Categories",
  description: "How the catalogue is organised, and where the stock value sits inside it.",
};

export default async function CategoriesPage() {
  const role = await getRole();
  if (!can(role, "categories")) return <PermissionDenied module="categories" role={role} />;

  const products = productRowsSync();
  const totalValue = products.reduce((s, p) => s + p.stock.value, 0);

  const categories = db.categories
    .map((category) => {
      const items = products.filter((p) => p.categoryId === category.id);
      const value = items.reduce((s, p) => s + p.stock.value, 0);
      const units = items.reduce((s, p) => s + p.stock.onHand, 0);
      const needsAttention = items.filter((p) =>
        ["low", "critical", "out-of-stock"].includes(
          healthOf(p.stock.available, p.reorderPoint),
        ),
      ).length;

      return {
        category,
        items,
        value,
        units,
        needsAttention,
        activeCount: items.filter((p) => p.status === "active").length,
        share: totalValue > 0 ? value / totalValue : 0,
        topProducts: [...items].sort((a, b) => b.stock.value - a.stock.value).slice(0, 3),
      };
    })
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Inventory", href: "/inventory/products" }, { label: "Categories" }]}
        title="Categories"
        description={`${db.categories.length} categories covering ${qty(products.length)} SKUs and ${money(totalValue)} of stock.`}
        actions={
          can(role, "categories", "create") && (
            <Button size="sm" className="h-8" render={<Link href="/inventory/categories/new" />}>
              <Plus className="size-3.5" aria-hidden />
              New category
            </Button>
          )
        }
      />

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2 xl:grid-cols-3">
        {categories.map(({ category, items, value, units, needsAttention, activeCount, share, topProducts }) => (
          <article
            key={category.id}
            className="flex flex-col overflow-hidden rounded-lg border bg-surface shadow-xs"
          >
            <header className="border-b px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-card-title truncate">
                    <Link
                      href={`/inventory/products?category=${encodeURIComponent(category.name)}`}
                      className="hover:underline"
                    >
                      {category.name}
                    </Link>
                  </h2>
                  <p className="mt-1 line-clamp-2 text-caption leading-relaxed text-muted-foreground">
                    {category.description}
                  </p>
                </div>
                {needsAttention > 0 && (
                  <StatusBadge label={`${needsAttention} need attention`} tone="warning" />
                )}
              </div>
            </header>

            <div className="grid gap-3 border-b px-4 py-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-caption text-muted-foreground">SKUs</p>
                  <p className="tabular text-[17px] font-bold" data-numeric>
                    {qty(items.length)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{qty(activeCount)} active</p>
                </div>
                <div>
                  <p className="text-caption text-muted-foreground">Units</p>
                  <p className="tabular text-[17px] font-bold" data-numeric>
                    {qty(units)}
                  </p>
                </div>
                <div>
                  <p className="text-caption text-muted-foreground">Value</p>
                  <p className="tabular text-[17px] font-bold" data-numeric>
                    {money(value)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{percent(share, 1)} of stock</p>
                </div>
              </div>
              <MeterBar
                value={share}
                tone="info"
                size="sm"
                label={`${category.name} holds ${percent(share, 1)} of total stock value`}
              />
            </div>

            <div className="flex-1 px-4 py-3">
              <p className="text-overline text-muted-foreground">Highest value SKUs</p>
              <ul className="mt-2 grid gap-2">
                {topProducts.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/inventory/products/${p.sku}`}
                      className="flex items-center gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-surface-hover"
                    >
                      <ProductThumb category={category.name} sku={p.sku} />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-[13px] font-medium">{p.shortName}</span>
                        <span className="text-code truncate text-[11px] text-muted-foreground">
                          {p.sku}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-[13px] font-medium" data-numeric>
                        {money(p.stock.value)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <footer className="border-t px-4 py-2.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start px-1"
                render={<Link href={`/inventory/products?category=${encodeURIComponent(category.name)}`} />}
              >
                View all {qty(items.length)} products
              </Button>
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}
