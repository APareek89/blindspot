CREATE TABLE "blindspot"."eval_example_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eval_run_id" uuid NOT NULL,
	"golden_example_id" uuid,
	"input" text NOT NULL,
	"reference_output" text,
	"candidate_output" text,
	"score" real,
	"per_criterion_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasoning" text,
	"issues_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"latency_ms" integer,
	"candidate_cost_cents" real,
	"judge_cost_cents" real,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blindspot"."eval_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"golden_set_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"model_refs_json" jsonb NOT NULL,
	"judge_model" text NOT NULL,
	"budget_cents" real NOT NULL,
	"full_estimated_cost_cents" real NOT NULL,
	"selected_estimated_cost_cents" real NOT NULL,
	"sample_seed" text NOT NULL,
	"selection_hash" text NOT NULL,
	"disclosure_json" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"authorized_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_reason" text,
	"actual_cost_cents" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blindspot"."eval_runs" ALTER COLUMN "avg_score" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_runs" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_runs" ADD COLUMN "status" text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_runs" ADD COLUMN "examples_planned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_runs" ADD COLUMN "examples_scored" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_runs" ADD COLUMN "examples_failed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_runs" ADD COLUMN "estimated_cost_cents" real;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_runs" ADD COLUMN "actual_cost_cents" real;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_runs" ADD COLUMN "sample_seed" text;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_example_results" ADD CONSTRAINT "eval_example_results_eval_run_id_eval_runs_id_fk" FOREIGN KEY ("eval_run_id") REFERENCES "blindspot"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_example_results" ADD CONSTRAINT "eval_example_results_golden_example_id_golden_examples_id_fk" FOREIGN KEY ("golden_example_id") REFERENCES "blindspot"."golden_examples"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_plans" ADD CONSTRAINT "eval_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "blindspot"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_plans" ADD CONSTRAINT "eval_plans_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "blindspot"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."eval_plans" ADD CONSTRAINT "eval_plans_golden_set_id_golden_sets_id_fk" FOREIGN KEY ("golden_set_id") REFERENCES "blindspot"."golden_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_example_results_run_idx" ON "blindspot"."eval_example_results" USING btree ("eval_run_id");--> statement-breakpoint
CREATE INDEX "eval_example_results_example_idx" ON "blindspot"."eval_example_results" USING btree ("golden_example_id");--> statement-breakpoint
CREATE INDEX "eval_plans_project_route_idx" ON "blindspot"."eval_plans" USING btree ("project_id","route_id");--> statement-breakpoint
CREATE INDEX "eval_plans_status_expires_idx" ON "blindspot"."eval_plans" USING btree ("status","expires_at");--> statement-breakpoint
ALTER TABLE "blindspot"."eval_runs" ADD CONSTRAINT "eval_runs_plan_id_eval_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "blindspot"."eval_plans"("id") ON DELETE set null ON UPDATE no action;