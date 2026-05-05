CREATE TABLE "analytics_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"label" text NOT NULL,
	"path" text NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitor_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proxy_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"url" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb NOT NULL,
	"started_at_ms" bigint NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"email_verified_at" timestamp with time zone,
	"plan_id" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_configs" ADD CONSTRAINT "field_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_items" ADD CONSTRAINT "monitor_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_items" ADD CONSTRAINT "proxy_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_jobs" ADD CONSTRAINT "schedule_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;