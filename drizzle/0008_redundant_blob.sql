CREATE TABLE "notifications" (
	"seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notifications_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"id" text NOT NULL,
	"ts" text NOT NULL,
	"category" text NOT NULL,
	"priority" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text NOT NULL,
	"read" boolean NOT NULL,
	"actor_id" text
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tasks_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"id" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"type" text NOT NULL,
	"priority" text NOT NULL,
	"due_at" text NOT NULL,
	"assigned_to" text NOT NULL,
	"href" text NOT NULL,
	"status" text NOT NULL
);
