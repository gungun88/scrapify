-- Phase 1：所有匿名（user_id IS NULL）业务记录都是历史 demo 数据，多租户上线后不再保留。
-- 这两句在空库上是 no-op，在已有匿名记录的 dev 库上清空它们以让随后的 NOT NULL 约束生效。
DELETE FROM "tasks" WHERE "user_id" IS NULL;--> statement-breakpoint
DELETE FROM "field_configs" WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "field_configs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_sub" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image_url" text;--> statement-breakpoint
CREATE INDEX "field_configs_user_idx" ON "field_configs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_created_idx" ON "tasks" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub");