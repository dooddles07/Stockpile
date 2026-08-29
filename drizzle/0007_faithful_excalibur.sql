CREATE TYPE "public"."adjustment_status" AS ENUM('draft', 'pending-approval', 'approved', 'rejected', 'applied');--> statement-breakpoint
CREATE TYPE "public"."count_status" AS ENUM('scheduled', 'in-progress', 'review', 'approved', 'applied', 'cancelled');--> statement-breakpoint
CREATE TABLE "adjustment_lines" (
	"seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "adjustment_lines_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"adjustment_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"location_id" text NOT NULL,
	"qty_before" integer NOT NULL,
	"qty_after" integer NOT NULL,
	"delta" integer NOT NULL,
	"unit_cost" numeric NOT NULL,
	"value_impact" numeric NOT NULL,
	"lot_number" text
);
--> statement-breakpoint
CREATE TABLE "adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" "adjustment_status" NOT NULL,
	"created_at" text NOT NULL,
	"applied_at" text,
	"total_delta" integer NOT NULL,
	"total_value_impact" numeric NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approvals" jsonb NOT NULL,
	"note" text NOT NULL,
	"requires_approval" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "count_lines" (
	"seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "count_lines_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"stock_count_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"location_id" text NOT NULL,
	"expected" integer NOT NULL,
	"counted" integer,
	"variance" integer NOT NULL,
	"variance_value" numeric NOT NULL,
	"counted_by" text,
	"counted_at" text,
	"recount" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "movements_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"id" text NOT NULL,
	"ts" text NOT NULL,
	"type" text NOT NULL,
	"product_id" text NOT NULL,
	"sku" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"location_id" text NOT NULL,
	"qty_before" integer NOT NULL,
	"qty_change" integer NOT NULL,
	"qty_after" integer NOT NULL,
	"unit_cost" numeric NOT NULL,
	"value_change" numeric NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" text NOT NULL,
	"ref_number" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"type" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"scope_label" text NOT NULL,
	"status" "count_status" NOT NULL,
	"scheduled_for" text NOT NULL,
	"started_at" text,
	"completed_at" text,
	"assigned_to" jsonb NOT NULL,
	"accuracy_pct" numeric NOT NULL,
	"total_variance_value" numeric NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text
);
--> statement-breakpoint
ALTER TABLE "adjustment_lines" ADD CONSTRAINT "adjustment_lines_adjustment_id_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."adjustments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustment_lines" ADD CONSTRAINT "adjustment_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustment_lines" ADD CONSTRAINT "adjustment_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "count_lines" ADD CONSTRAINT "count_lines_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "count_lines" ADD CONSTRAINT "count_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "count_lines" ADD CONSTRAINT "count_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;