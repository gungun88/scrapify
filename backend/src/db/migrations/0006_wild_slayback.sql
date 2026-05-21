CREATE TABLE "proxies" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"scheme" text NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"username" text,
	"password" text,
	"label" text,
	"country_code" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"latency_ms" integer,
	"last_checked_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proxies_scheme_check" CHECK ("proxies"."scheme" IN ('http', 'https')),
	CONSTRAINT "proxies_status_check" CHECK ("proxies"."status" IN ('online', 'offline', 'unknown')),
	CONSTRAINT "proxies_port_check" CHECK ("proxies"."port" BETWEEN 1 AND 65535)
);
--> statement-breakpoint
ALTER TABLE "proxies" ADD CONSTRAINT "proxies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proxies_user_created_idx" ON "proxies" USING btree ("user_id","created_at");