CREATE TYPE "public"."fulfillment_status" AS ENUM('unfulfilled', 'partial', 'fulfilled', 'returned');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'partial', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."so_status" AS ENUM('draft', 'confirmed', 'reserved', 'picking', 'packing', 'shipped', 'delivered', 'cancelled', 'backorder');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"credit_limit" numeric NOT NULL,
	"outstanding" numeric NOT NULL,
	"total_orders" integer NOT NULL,
	"total_spend" numeric NOT NULL,
	"status" text NOT NULL,
	"since" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_order_lines" (
	"seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sales_order_lines_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sales_order_id" text NOT NULL,
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
CREATE TABLE "sales_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"customer_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"status" "so_status" NOT NULL,
	"payment_status" "payment_status" NOT NULL,
	"fulfillment_status" "fulfillment_status" NOT NULL,
	"channel" text NOT NULL,
	"placed_at" text NOT NULL,
	"promised_at" text NOT NULL,
	"shipped_at" text,
	"subtotal" numeric NOT NULL,
	"tax_total" numeric NOT NULL,
	"discount_total" numeric NOT NULL,
	"shipping" numeric NOT NULL,
	"total" numeric NOT NULL,
	"currency" text NOT NULL,
	"created_by" text NOT NULL,
	"carrier" text,
	"tracking_number" text,
	"ship_to_city" text NOT NULL,
	"notes" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;