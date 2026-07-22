CREATE TYPE "blindspot"."execution_feedback_kind" AS ENUM('up', 'down', 'score');--> statement-breakpoint
CREATE TABLE "blindspot"."execution_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"workflow_id" uuid,
	"execution_external_id" text NOT NULL,
	"node_name" text,
	"kind" "blindspot"."execution_feedback_kind" NOT NULL,
	"value" real,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blindspot"."execution_feedback" ADD CONSTRAINT "execution_feedback_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "blindspot"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blindspot"."execution_feedback" ADD CONSTRAINT "execution_feedback_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "blindspot"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "execution_feedback_project_created_idx" ON "blindspot"."execution_feedback" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "execution_feedback_workflow_created_idx" ON "blindspot"."execution_feedback" USING btree ("workflow_id","created_at");