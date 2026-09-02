-- The ADD CONSTRAINT statements are hand-wrapped in DO blocks that swallow
-- "already exists". The "ci" Neon branch carries five of these unique
-- constraints already, created outside the migration history, and an
-- ALTER TABLE that hits one aborts the whole migration - drizzle-kit
-- reports the failure with no error text at all. The end state is the same
-- either way: one unique constraint per number column. The sequences carry
-- IF NOT EXISTS for the same reason: a branch that already has one must not
-- abort the migration either.
CREATE SEQUENCE IF NOT EXISTS "public"."adjustment_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 300 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."purchase_order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."return_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."sales_order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 4000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."stock_count_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 50 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."transfer_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 200 CACHE 1;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_number_unique" UNIQUE("number");
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_number_unique" UNIQUE("number");
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "returns" ADD CONSTRAINT "returns_number_unique" UNIQUE("number");
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_number_unique" UNIQUE("number");
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_number_unique" UNIQUE("number");
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "transfers" ADD CONSTRAINT "transfers_number_unique" UNIQUE("number");
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN duplicate_object THEN null;
END $$;
