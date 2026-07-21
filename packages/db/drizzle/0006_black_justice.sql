CREATE TABLE "blindspot"."beta_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"attempted" text NOT NULL,
	"expected" text NOT NULL,
	"actual" text NOT NULL,
	"impact" text NOT NULL,
	"framework" text,
	"capture_mode" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blindspot"."beta_feedback" ADD CONSTRAINT "beta_feedback_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "blindspot"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beta_feedback_project_created_idx" ON "blindspot"."beta_feedback" USING btree ("project_id","created_at");