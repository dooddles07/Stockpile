CREATE TABLE "audit_entries" (
	"seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_entries_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"id" text NOT NULL,
	"ts" text NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_label" text NOT NULL,
	"field" text,
	"before" text,
	"after" text,
	"ip" text NOT NULL,
	"device" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"trigger" text NOT NULL,
	"conditions" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"enabled" boolean NOT NULL,
	"last_run_at" text,
	"run_count" integer NOT NULL,
	"success_rate" numeric NOT NULL,
	"created_by" text NOT NULL,
	"scope" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "automation_runs_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"id" text NOT NULL,
	"rule_id" text NOT NULL,
	"ts" text NOT NULL,
	"outcome" text NOT NULL,
	"affected" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"vendor" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"last_sync_at" text,
	"records_synced" integer NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"summary" text NOT NULL,
	"responsibilities" jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	"permissions" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"department" text NOT NULL,
	"status" text NOT NULL,
	"last_login_at" text,
	"created_at" text NOT NULL,
	"warehouse_id" text,
	"phone" text NOT NULL,
	"two_factor" boolean NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;