CREATE SEQUENCE "public"."adjustment_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 300 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."purchase_order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."purchase_return_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."sales_order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 4000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."sales_return_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."stock_count_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 50 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."transfer_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 200 CACHE 1;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_number_unique" UNIQUE("number");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_number_unique" UNIQUE("number");--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_number_unique" UNIQUE("number");--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_number_unique" UNIQUE("number");--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_number_unique" UNIQUE("number");--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_number_unique" UNIQUE("number");