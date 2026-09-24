CREATE TABLE "htag_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid,
	"analysis_step_id" uuid,
	"endpoint" text NOT NULL,
	"request_json" jsonb NOT NULL,
	"rows_returned" integer DEFAULT 0 NOT NULL,
	"tier" text NOT NULL,
	"cost_aud" numeric(10, 4) DEFAULT '0' NOT NULL,
	"status_code" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "htag_calls_tier_check" CHECK ("htag_calls"."tier" in ('reference', 'standard', 'enhanced', 'premium', 'restricted', 'agent')),
	CONSTRAINT "htag_calls_rows_returned_check" CHECK ("htag_calls"."rows_returned" >= 0),
	CONSTRAINT "htag_calls_cost_aud_check" CHECK ("htag_calls"."cost_aud" >= 0)
);
--> statement-breakpoint
ALTER TABLE "suburb_metrics_ts" RENAME COLUMN "observed_at" TO "measured_at";--> statement-breakpoint
ALTER TABLE "suburbs" RENAME COLUMN "htag_id" TO "htag_area_id";--> statement-breakpoint
DROP INDEX "suburb_metrics_ts_observed_at_idx";--> statement-breakpoint
DROP INDEX "suburb_metrics_ts_metric_name_observed_at_idx";--> statement-breakpoint
DROP INDEX "suburbs_tenant_htag_id_key";--> statement-breakpoint
ALTER TABLE "suburb_metrics_ts" ADD COLUMN "property_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "suburb_metrics_ts" ADD COLUMN "bedrooms" text DEFAULT 'All' NOT NULL;--> statement-breakpoint
ALTER TABLE "suburb_metrics_ts" ADD COLUMN "confidence" text;--> statement-breakpoint
ALTER TABLE "suburbs" ADD COLUMN "abs_sal_code" text;--> statement-breakpoint
ALTER TABLE "htag_calls" ADD CONSTRAINT "htag_calls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "htag_calls" ADD CONSTRAINT "htag_calls_task_id_purchase_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."purchase_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "htag_calls_tenant_id_idx" ON "htag_calls" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "htag_calls_task_id_idx" ON "htag_calls" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "htag_calls_analysis_step_id_idx" ON "htag_calls" USING btree ("analysis_step_id");--> statement-breakpoint
CREATE INDEX "htag_calls_created_at_idx" ON "htag_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "suburb_metrics_ts_measured_at_idx" ON "suburb_metrics_ts" USING btree ("measured_at");--> statement-breakpoint
CREATE INDEX "suburb_metrics_ts_metric_name_measured_at_idx" ON "suburb_metrics_ts" USING btree ("metric_name","measured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "suburbs_tenant_htag_area_id_key" ON "suburbs" USING btree ("tenant_id","htag_area_id");--> statement-breakpoint
CREATE INDEX "suburbs_abs_sal_code_idx" ON "suburbs" USING btree ("abs_sal_code");--> statement-breakpoint
ALTER TABLE "suburb_metrics_ts" DROP CONSTRAINT "suburb_metrics_ts_pkey";
--> statement-breakpoint
ALTER TABLE "suburb_metrics_ts" ADD CONSTRAINT "suburb_metrics_ts_pkey" PRIMARY KEY("suburb_id","property_type","bedrooms","metric_name","measured_at");--> statement-breakpoint
ALTER TABLE "suburb_metrics_ts" ADD CONSTRAINT "suburb_metrics_ts_property_type_check" CHECK ("suburb_metrics_ts"."property_type" in ('house', 'unit'));