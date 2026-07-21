ALTER TABLE "blindspot"."drift_events" ADD COLUMN "source" text DEFAULT 'simulation' NOT NULL;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_plans" ADD COLUMN "execution_mode" text DEFAULT 'model_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_runs" ADD COLUMN "execution_mode" text DEFAULT 'model_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_runs" ADD COLUMN "score_method" text DEFAULT 'legacy_judge_overall' NOT NULL;--> statement-breakpoint
ALTER TABLE "blindspot"."workflows" ADD COLUMN "integration_mode" text DEFAULT 'observe_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "blindspot"."workflows" ADD COLUMN "context_manifest_json" jsonb;--> statement-breakpoint
ALTER TABLE "blindspot"."workflows" ADD COLUMN "context_hash" text;--> statement-breakpoint
ALTER TABLE "blindspot"."workflows" ADD COLUMN "context_shared_at" timestamp with time zone;