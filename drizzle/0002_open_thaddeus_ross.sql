CREATE TYPE "public"."po_status" AS ENUM('draft', 'submitted', 'approved', 'ordered', 'partially-received', 'received', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."return_kind" AS ENUM('purchase', 'sales');--> statement-breakpoint
CREATE TYPE "public"."return_status" AS ENUM('requested', 'approved', 'in-transit', 'received', 'inspected', 'credited', 'rejected');--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_order_lines_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"purchase_order_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"fulfilled" integer NOT NULL,
	"unit_price" numeric NOT NULL,
	"discount_pct" numeric NOT NULL,
	"tax_pct" numeric NOT NULL,
	"line_total" numeric NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"supplier_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"status" "po_status" NOT NULL,
	"created_at" text NOT NULL,
	"ordered_at" text,
	"expected_at" text NOT NULL,
	"received_at" text,
	"subtotal" numeric NOT NULL,
	"tax_total" numeric NOT NULL,
	"discount_total" numeric NOT NULL,
	"shipping" numeric NOT NULL,
	"total" numeric NOT NULL,
	"currency" text NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approvals" jsonb NOT NULL,
	"notes" text NOT NULL,
	"attachments" jsonb NOT NULL,
	"payment_terms" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_lines" (
	"seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "return_lines_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"return_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"condition" text NOT NULL,
	"restock" boolean NOT NULL,
	"unit_price" numeric NOT NULL,
	"refund_amount" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"kind" "return_kind" NOT NULL,
	"partner_id" text NOT NULL,
	"source_order_id" text NOT NULL,
	"source_order_number" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"status" "return_status" NOT NULL,
	"reason" text NOT NULL,
	"created_at" text NOT NULL,
	"resolved_at" text,
	"refund_total" numeric NOT NULL,
	"restock_value" numeric NOT NULL,
	"created_by" text NOT NULL,
	"note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"payment_terms" text NOT NULL,
	"currency" text NOT NULL,
	"lead_time_days" integer NOT NULL,
	"on_time_rate" numeric NOT NULL,
	"fulfillment_rate" numeric NOT NULL,
	"defect_rate" numeric NOT NULL,
	"total_spend" numeric NOT NULL,
	"open_orders" integer NOT NULL,
	"status" text NOT NULL,
	"since" text NOT NULL,
	"categories" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;