CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" text,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"warehouse_id" text NOT NULL,
	"code" text NOT NULL,
	"zone" text NOT NULL,
	"aisle" text NOT NULL,
	"rack" text NOT NULL,
	"bin" text NOT NULL,
	"type" text NOT NULL,
	"capacity_units" integer NOT NULL,
	"occupied_units" integer NOT NULL,
	"restricted" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"category_id" text NOT NULL,
	"brand" text NOT NULL,
	"description" text NOT NULL,
	"barcode" text NOT NULL,
	"unit" text NOT NULL,
	"unit_cost" numeric NOT NULL,
	"sell_price" numeric NOT NULL,
	"status" text NOT NULL,
	"primary_supplier_id" text NOT NULL,
	"supplier_ids" jsonb NOT NULL,
	"reorder_point" integer NOT NULL,
	"reorder_qty" integer NOT NULL,
	"lead_time_days" integer NOT NULL,
	"weight_kg" numeric NOT NULL,
	"dimensions_cm" text NOT NULL,
	"batch_tracked" boolean NOT NULL,
	"serial_tracked" boolean NOT NULL,
	"has_expiry" boolean NOT NULL,
	"shelf_life_days" integer,
	"hs_code" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "stock_rows" (
	"seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_rows_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"location_id" text NOT NULL,
	"on_hand" integer NOT NULL,
	"reserved" integer NOT NULL,
	"damaged" integer NOT NULL,
	"incoming" integer NOT NULL,
	"in_transit" integer NOT NULL,
	"last_counted_at" text,
	"expires_at" text,
	"lot_number" text
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"region" text NOT NULL,
	"country" text NOT NULL,
	"manager_id" text NOT NULL,
	"capacity_pallets" integer NOT NULL,
	"used_pallets" integer NOT NULL,
	"status" text NOT NULL,
	"opened_at" text NOT NULL,
	"timezone" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_rows" ADD CONSTRAINT "stock_rows_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_rows" ADD CONSTRAINT "stock_rows_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_rows" ADD CONSTRAINT "stock_rows_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;