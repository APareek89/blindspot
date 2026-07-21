ALTER TABLE "blindspot"."workflows" ADD COLUMN "replay_url" text;--> statement-breakpoint
ALTER TABLE "blindspot"."workflows" ADD COLUMN "replay_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "blindspot"."workflows" ADD COLUMN "replay_enabled" boolean DEFAULT false NOT NULL;