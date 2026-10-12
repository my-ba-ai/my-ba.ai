CREATE TABLE "analysis_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"attempt" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"outcome" text,
	"failure_reason" text,
	"failure_detail" text,
	"request_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_aud" numeric(10, 4) DEFAULT '0' NOT NULL,
	"preset_version" text,
	"weights_customised" boolean,
	"filters_customised" boolean,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_steps_stage_check" CHECK ("analysis_steps"."stage" in ('screening')),
	CONSTRAINT "analysis_steps_attempt_check" CHECK ("analysis_steps"."attempt" >= 1),
	CONSTRAINT "analysis_steps_status_check" CHECK ("analysis_steps"."status" in ('running', 'completed', 'failed')),
	CONSTRAINT "analysis_steps_outcome_check" CHECK ("analysis_steps"."outcome" is null or "analysis_steps"."outcome" in ('too_broad', 'ranked')),
	CONSTRAINT "analysis_steps_failure_reason_check" CHECK ("analysis_steps"."failure_reason" is null or "analysis_steps"."failure_reason" in ('HTAG_QUOTA_EXCEEDED', 'HTAG_BALANCE_EXHAUSTED', 'INVALID_CRITERIA', 'UNEXPECTED')),
	CONSTRAINT "analysis_steps_outcome_status_check" CHECK (("analysis_steps"."outcome" is not null) = ("analysis_steps"."status" = 'completed')),
	CONSTRAINT "analysis_steps_failure_status_check" CHECK ("analysis_steps"."failure_reason" is null or "analysis_steps"."status" = 'failed'),
	CONSTRAINT "analysis_steps_cost_aud_check" CHECK ("analysis_steps"."cost_aud" >= 0)
);
--> statement-breakpoint
CREATE TABLE "screening_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"analysis_step_id" uuid NOT NULL,
	"suburb_id" uuid NOT NULL,
	"htag_area_id" text NOT NULL,
	"rank" integer NOT NULL,
	"score" double precision,
	"coverage" double precision NOT NULL,
	"insufficient_data" boolean NOT NULL,
	"score_breakdown_json" jsonb NOT NULL,
	"supply_json" jsonb,
	"shortlisted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screening_results_rank_check" CHECK ("screening_results"."rank" >= 1),
	CONSTRAINT "screening_results_coverage_check" CHECK ("screening_results"."coverage" >= 0 and "screening_results"."coverage" <= 1.000000001)
);
--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD CONSTRAINT "analysis_steps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD CONSTRAINT "analysis_steps_task_id_purchase_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."purchase_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_task_id_purchase_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."purchase_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_analysis_step_id_analysis_steps_id_fk" FOREIGN KEY ("analysis_step_id") REFERENCES "public"."analysis_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_suburb_id_suburbs_id_fk" FOREIGN KEY ("suburb_id") REFERENCES "public"."suburbs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_steps_task_stage_attempt_key" ON "analysis_steps" USING btree ("task_id","stage","attempt");--> statement-breakpoint
CREATE INDEX "analysis_steps_tenant_id_idx" ON "analysis_steps" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "screening_results_step_suburb_key" ON "screening_results" USING btree ("analysis_step_id","suburb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "screening_results_step_rank_key" ON "screening_results" USING btree ("analysis_step_id","rank");--> statement-breakpoint
CREATE INDEX "screening_results_tenant_id_idx" ON "screening_results" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "screening_results_task_id_idx" ON "screening_results" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "screening_results_suburb_id_idx" ON "screening_results" USING btree ("suburb_id");--> statement-breakpoint
ALTER TABLE "htag_calls" ADD CONSTRAINT "htag_calls_analysis_step_id_analysis_steps_id_fk" FOREIGN KEY ("analysis_step_id") REFERENCES "public"."analysis_steps"("id") ON DELETE set null ON UPDATE no action;