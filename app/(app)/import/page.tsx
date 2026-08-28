import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { ImportWizard } from "./import-wizard";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import type { ImportKind } from "@/lib/import/validate";

export const metadata: Metadata = {
  title: "Import data",
  description: "Bring products, suppliers, customers or opening stock in from a file.",
};

export default async function ImportPage() {
  const role = await getRole();

  // Each import type follows the permissions of the module it writes to.
  const kinds: ImportKind[] = [];
  if (can(role, "products", "create")) kinds.push("products");
  if (can(role, "suppliers", "create")) kinds.push("suppliers");
  if (can(role, "customers", "create")) kinds.push("customers");
  if (can(role, "stock", "edit")) kinds.push("stock");

  if (kinds.length === 0) {
    return <PermissionDenied module="products" role={role} action="import into" />;
  }

  // Existing identifiers, so the wizard can tell a create from an update
  // before anything is written.
  const existingKeys: Record<string, string[]> = {
    products: db.products.map((p) => p.sku),
    suppliers: db.suppliers.map((s) => s.code),
    customers: db.customers.map((c) => c.code),
    stock: db.products.map((p) => p.sku),
  };

  return (
    <>
      <PageHeader
        title="Import data"
        description="Nothing is written until you have seen what will happen. Rows with errors are skipped whole — there is no such thing as a half-imported record."
      />

      <div className="p-4 sm:p-6">
        <ImportWizard kinds={kinds} existingKeys={existingKeys} />
      </div>
    </>
  );
}
