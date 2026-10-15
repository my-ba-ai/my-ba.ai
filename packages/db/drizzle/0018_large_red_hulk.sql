ALTER TABLE "analysis_steps" ADD COLUMN "gate_kind" text;--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD COLUMN "gate_status" text;--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD COLUMN "gate_payload" jsonb;--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD COLUMN "gate_decision" jsonb;--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD COLUMN "gate_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD COLUMN "gate_decided_by" uuid;--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD CONSTRAINT "analysis_steps_gate_decided_by_users_id_fk" FOREIGN KEY ("gate_decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD CONSTRAINT "analysis_steps_gate_kind_check" CHECK ("analysis_steps"."gate_kind" is null or "analysis_steps"."gate_kind" in ('SCREENING_TOO_BROAD', 'SCREENING_APPROVAL'));--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD CONSTRAINT "analysis_steps_gate_status_check" CHECK ("analysis_steps"."gate_status" is null or "analysis_steps"."gate_status" in ('awaiting', 'approved', 'rejected'));--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD CONSTRAINT "analysis_steps_gate_complete_check" CHECK (("analysis_steps"."gate_kind" is null) = ("analysis_steps"."gate_status" is null) and ("analysis_steps"."gate_kind" is null) = ("analysis_steps"."gate_payload" is null) and ("analysis_steps"."gate_kind" is null or "analysis_steps"."status" = 'completed'));--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD CONSTRAINT "analysis_steps_gate_outcome_check" CHECK ("analysis_steps"."gate_kind" is null or ("analysis_steps"."gate_kind" = 'SCREENING_TOO_BROAD') = ("analysis_steps"."outcome" = 'too_broad'));--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD CONSTRAINT "analysis_steps_gate_decision_check" CHECK (("analysis_steps"."gate_decided_at" is not null) = ("analysis_steps"."gate_status" is not null and "analysis_steps"."gate_status" <> 'awaiting') and ("analysis_steps"."gate_decision" is not null) = ("analysis_steps"."gate_decided_at" is not null));--> statement-breakpoint
ALTER TABLE "analysis_steps" ADD CONSTRAINT "analysis_steps_gate_too_broad_check" CHECK ("analysis_steps"."gate_kind" is distinct from 'SCREENING_TOO_BROAD' or "analysis_steps"."gate_status" <> 'approved');