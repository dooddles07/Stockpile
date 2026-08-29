/**
 * Stockpile domain model.
 *
 * Every status union in the product collapses into one of six visual tones
 * (see `statusTone` in lib/status.ts). Adding a status without adding its tone
 * mapping is a compile error there, not a silent grey badge.
 */

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "purple";

/* ------------------------------------------------------------------ roles */

export type Role =
  | "super-admin"
  | "inventory-manager"
  | "warehouse-staff"
  | "purchasing-manager"
  | "sales-manager"
  | "finance"
  | "auditor";

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "export"
  | "manage";

export type ModuleKey =
  | "dashboard"
  | "approvals"
  | "products"
  | "categories"
  | "stock"
  | "movements"
  | "adjustments"
  | "counts"
  | "warehouses"
  | "locations"
  | "transfers"
  | "receiving"
  | "fulfillment"
  | "purchase-orders"
  | "suppliers"
  | "purchase-returns"
  | "sales-orders"
  | "customers"
  | "sales-returns"
  | "analytics"
  | "valuation"
  | "reports"
  | "users"
  | "roles"
  | "audit"
  | "automation"
  | "integrations"
  | "settings";

/**
 * Access to a module, one level per role. The levels expand into
 * `PermissionAction`s (see `LEVEL_ACTIONS` in `lib/auth/permissions.ts`).
 */
export type AccessLevel =
  | "none"
  | "read"
  | "read-export"
  | "write"
  | "approve"
  | "manage";

/**
 * A Role as a database row (ADR-0004). The permission engine hydrates its
 * matrix from these; `permissions` is the per-module level map, stored as one
 * jsonb column rather than a join table — there is no write path against it
 * yet, and 7 rows do not need normalising.
 */
export interface RoleRow {
  id: Role;
  label: string;
  summary: string;
  responsibilities: string[];
  /** Preserves the column / switcher order the hardcoded array used to fix. */
  sortOrder: number;
  permissions: Partial<Record<ModuleKey, AccessLevel>>;
}

/* --------------------------------------------------------------- entities */

export type ProductStatus = "active" | "draft" | "discontinued" | "archived";
export type StockHealth =
  | "healthy"
  | "low"
  | "critical"
  | "out-of-stock"
  | "overstock";

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  shortName: string;
  categoryId: string;
  brand: string;
  description: string;
  barcode: string;
  unit: string;
  unitCost: number;
  sellPrice: number;
  status: ProductStatus;
  primarySupplierId: string;
  supplierIds: string[];
  reorderPoint: number;
  reorderQty: number;
  leadTimeDays: number;
  weightKg: number;
  dimensionsCm: string;
  batchTracked: boolean;
  serialTracked: boolean;
  hasExpiry: boolean;
  shelfLifeDays: number | null;
  hsCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockRow {
  productId: string;
  warehouseId: string;
  locationId: string;
  onHand: number;
  reserved: number;
  damaged: number;
  incoming: number;
  inTransit: number;
  lastCountedAt: string | null;
  expiresAt: string | null;
  lotNumber: string | null;
}

export type WarehouseType = "distribution" | "retail" | "fulfillment" | "cold";

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  type: WarehouseType;
  addressLine: string;
  city: string;
  region: string;
  country: string;
  managerId: string;
  capacityPallets: number;
  usedPallets: number;
  status: "operational" | "maintenance" | "closed";
  openedAt: string;
  timezone: string;
}

export type LocationType = "bin" | "shelf" | "floor" | "staging" | "quarantine";

export interface StockLocation {
  id: string;
  warehouseId: string;
  code: string;
  zone: string;
  aisle: string;
  rack: string;
  bin: string;
  type: LocationType;
  capacityUnits: number;
  occupiedUnits: number;
  restricted: boolean;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine: string;
  city: string;
  country: string;
  paymentTerms: string;
  currency: string;
  leadTimeDays: number;
  onTimeRate: number;
  fulfillmentRate: number;
  defectRate: number;
  totalSpend: number;
  openOrders: number;
  status: "active" | "on-hold" | "inactive";
  since: string;
  categories: string[];
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  type: "retail" | "wholesale" | "online" | "government";
  contactName: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  creditLimit: number;
  outstanding: number;
  totalOrders: number;
  totalSpend: number;
  status: "active" | "on-hold" | "inactive";
  since: string;
}

export type POStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "ordered"
  | "partially-received"
  | "received"
  | "closed"
  | "cancelled";

export interface OrderLine {
  id: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  fulfilled: number;
  unitPrice: number;
  discountPct: number;
  taxPct: number;
  lineTotal: number;
  note?: string;
}

export interface ApprovalEvent {
  id: string;
  ts: string;
  userId: string;
  action: "created" | "submitted" | "approved" | "rejected" | "commented";
  note?: string;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplierId: string;
  warehouseId: string;
  status: POStatus;
  createdAt: string;
  orderedAt: string | null;
  expectedAt: string;
  receivedAt: string | null;
  lines: OrderLine[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  shipping: number;
  total: number;
  currency: string;
  createdBy: string;
  approvedBy: string | null;
  approvals: ApprovalEvent[];
  notes: string;
  attachments: Attachment[];
  paymentTerms: string;
}

export type SOStatus =
  | "draft"
  | "confirmed"
  | "reserved"
  | "picking"
  | "packing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "backorder";

export type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded";
export type FulfillmentStatus =
  | "unfulfilled"
  | "partial"
  | "fulfilled"
  | "returned";

export interface SalesOrder {
  id: string;
  number: string;
  customerId: string;
  warehouseId: string;
  status: SOStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  channel: "web" | "pos" | "phone" | "edi" | "marketplace";
  placedAt: string;
  promisedAt: string;
  shippedAt: string | null;
  lines: OrderLine[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  shipping: number;
  total: number;
  currency: string;
  createdBy: string;
  carrier: string | null;
  trackingNumber: string | null;
  shipToCity: string;
  notes: string;
}

export type TransferStatus =
  | "draft"
  | "pending-approval"
  | "approved"
  | "in-transit"
  | "partially-received"
  | "received"
  | "cancelled";

export interface TransferLine {
  id: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  shipped: number;
  received: number;
  fromLocationId: string;
  toLocationId: string | null;
}

export interface Transfer {
  id: string;
  number: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: TransferStatus;
  createdAt: string;
  approvedAt: string | null;
  shippedAt: string | null;
  expectedAt: string;
  receivedAt: string | null;
  lines: TransferLine[];
  requestedBy: string;
  approvedBy: string | null;
  approvals: ApprovalEvent[];
  carrier: string | null;
  trackingNumber: string | null;
  reason: string;
  notes: string;
}

export type AdjustmentReason =
  | "damaged"
  | "lost"
  | "found"
  | "expired"
  | "count-error"
  | "manual-correction"
  | "internal-use"
  | "other";

export type AdjustmentStatus =
  | "draft"
  | "pending-approval"
  | "approved"
  | "rejected"
  | "applied";

export interface AdjustmentLine {
  id: string;
  productId: string;
  sku: string;
  name: string;
  locationId: string;
  qtyBefore: number;
  qtyAfter: number;
  delta: number;
  unitCost: number;
  valueImpact: number;
  lotNumber: string | null;
}

export interface Adjustment {
  id: string;
  number: string;
  warehouseId: string;
  reason: AdjustmentReason;
  status: AdjustmentStatus;
  createdAt: string;
  appliedAt: string | null;
  lines: AdjustmentLine[];
  totalDelta: number;
  totalValueImpact: number;
  createdBy: string;
  approvedBy: string | null;
  approvals: ApprovalEvent[];
  note: string;
  requiresApproval: boolean;
}

export type CountType = "full" | "cycle" | "category" | "location" | "spot";
export type CountStatus =
  | "scheduled"
  | "in-progress"
  | "review"
  | "approved"
  | "applied"
  | "cancelled";

export interface CountLine {
  id: string;
  productId: string;
  sku: string;
  name: string;
  locationId: string;
  expected: number;
  counted: number | null;
  variance: number;
  varianceValue: number;
  countedBy: string | null;
  countedAt: string | null;
  recount: boolean;
}

export interface StockCount {
  id: string;
  number: string;
  type: CountType;
  warehouseId: string;
  scopeLabel: string;
  status: CountStatus;
  scheduledFor: string;
  startedAt: string | null;
  completedAt: string | null;
  assignedTo: string[];
  lines: CountLine[];
  accuracyPct: number;
  totalVarianceValue: number;
  createdBy: string;
  approvedBy: string | null;
}

export type ReturnKind = "purchase" | "sales";
export type ReturnStatus =
  | "requested"
  | "approved"
  | "in-transit"
  | "received"
  | "inspected"
  | "credited"
  | "rejected";
export type ItemCondition = "sellable" | "damaged" | "defective" | "expired";

export interface ReturnLine {
  id: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  condition: ItemCondition;
  restock: boolean;
  unitPrice: number;
  refundAmount: number;
}

export interface ReturnDoc {
  id: string;
  number: string;
  kind: ReturnKind;
  partnerId: string;
  sourceOrderId: string;
  sourceOrderNumber: string;
  warehouseId: string;
  status: ReturnStatus;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  lines: ReturnLine[];
  refundTotal: number;
  restockValue: number;
  createdBy: string;
  note: string;
}

export type MovementType =
  | "purchase-receipt"
  | "sale"
  | "transfer-out"
  | "transfer-in"
  | "adjustment"
  | "return-in"
  | "return-out"
  | "damage"
  | "count-correction";

export interface Movement {
  id: string;
  ts: string;
  type: MovementType;
  productId: string;
  sku: string;
  warehouseId: string;
  locationId: string;
  qtyBefore: number;
  qtyChange: number;
  qtyAfter: number;
  unitCost: number;
  valueChange: number;
  refType: string;
  refId: string;
  refNumber: string;
  userId: string;
  reason: string;
}

export interface Attachment {
  id: string;
  name: string;
  sizeKb: number;
  kind: "pdf" | "image" | "csv" | "doc";
  uploadedAt: string;
  uploadedBy: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  status: "active" | "invited" | "suspended";
  lastLoginAt: string | null;
  createdAt: string;
  warehouseId: string | null;
  phone: string;
  twoFactor: boolean;
}

export interface AuditEntry {
  id: string;
  ts: string;
  userId: string;
  action:
    | "create"
    | "update"
    | "delete"
    | "approve"
    | "reject"
    | "login"
    | "export"
    | "permission-change";
  entity: string;
  entityId: string;
  entityLabel: string;
  field: string | null;
  before: string | null;
  after: string | null;
  ip: string;
  device: string;
}

export type NotificationPriority = "critical" | "high" | "normal" | "low";

export interface AppNotification {
  id: string;
  ts: string;
  category:
    | "stock"
    | "approval"
    | "receiving"
    | "expiry"
    | "integration"
    | "import"
    | "system";
  priority: NotificationPriority;
  title: string;
  body: string;
  href: string;
  read: boolean;
  actorId: string | null;
}

export interface TaskItem {
  id: string;
  title: string;
  detail: string;
  type: "approval" | "receiving" | "count" | "picking" | "review" | "reorder";
  priority: NotificationPriority;
  dueAt: string;
  assignedTo: string;
  href: string;
  status: "open" | "in-progress" | "done" | "overdue";
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  conditions: string[];
  actions: string[];
  enabled: boolean;
  lastRunAt: string | null;
  runCount: number;
  successRate: number;
  createdBy: string;
  scope: string;
}

export interface AutomationRun {
  id: string;
  ruleId: string;
  ts: string;
  outcome: "success" | "failed" | "skipped";
  affected: number;
  durationMs: number;
  message: string;
}

export interface Integration {
  id: string;
  name: string;
  vendor: string;
  category: "ecommerce" | "accounting" | "shipping" | "payments" | "edi" | "bi";
  status: "connected" | "error" | "disconnected" | "syncing";
  lastSyncAt: string | null;
  recordsSynced: number;
  description: string;
}

/* -------------------------------------------------------------- computed */

export interface StockSummary {
  productId: string;
  onHand: number;
  reserved: number;
  damaged: number;
  incoming: number;
  inTransit: number;
  available: number;
  value: number;
  health: StockHealth;
  warehouseCount: number;
}
