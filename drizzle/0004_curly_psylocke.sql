CREATE TYPE "public"."transfer_status" AS ENUM('draft', 'pending-approval', 'approved', 'in-transit', 'partially-received', 'received', 'cancelled');--> statement-breakpoint
CREATE TABLE "transfer_lines" (
	"seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transfer_lines_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"transfer_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"shipped" integer NOT NULL,
	"received" integer NOT NULL,
	"from_location_id" text NOT NULL,
	"to_location_id" text
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"from_warehouse_id" text NOT NULL,
	"to_warehouse_id" text NOT NULL,
	"status" "transfer_status" NOT NULL,
	"created_at" text NOT NULL,
	"approved_at" text,
	"shipped_at" text,
	"expected_at" text NOT NULL,
	"received_at" text,
	"requested_by" text NOT NULL,
	"approved_by" text,
	"approvals" jsonb NOT NULL,
	"carrier" text,
	"tracking_number" text,
	"reason" text NOT NULL,
	"notes" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;