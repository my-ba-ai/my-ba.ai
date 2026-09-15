CREATE TYPE "public"."agent_type" AS ENUM('SUBURB_SCREENER', 'TREND_ANALYSER', 'GROWTH_ANALYSER', 'PROPERTY_SCOUT', 'AGENT_DISCOVERY', 'OUTREACH_COORDINATOR');--> statement-breakpoint
CREATE TYPE "public"."au_state" AS ENUM('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('DRAFT', 'SCREENING', 'TREND_ANALYSIS', 'GROWTH_ANALYSIS', 'PROPERTY_SCOUTING', 'AGENT_DISCOVERY', 'CONTACT_AGENT', 'IN_PROGRESS', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('investor', 'agent', 'admin');--> statement-breakpoint
CREATE TABLE "purchase_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "task_status" DEFAULT 'DRAFT' NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_snapshot_id" uuid,
	"cloned_from_task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suburb_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL,
	"suburb_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suburb_metrics_ts" (
	"suburb_id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL,
	"metric_name" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"value" double precision NOT NULL,
	"source" text DEFAULT 'HTAG' NOT NULL,
	CONSTRAINT "suburb_metrics_ts_pkey" PRIMARY KEY("suburb_id","metric_name","observed_at")
);
--> statement-breakpoint
CREATE TABLE "suburbs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL,
	"name" text NOT NULL,
	"state" "au_state" NOT NULL,
	"postcode" text NOT NULL,
	"h3_index" text,
	"htag_id" text,
	"domain_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"external_auth_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'investor' NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD CONSTRAINT "purchase_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD CONSTRAINT "purchase_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD CONSTRAINT "purchase_tasks_cloned_from_task_id_purchase_tasks_id_fk" FOREIGN KEY ("cloned_from_task_id") REFERENCES "public"."purchase_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suburb_embeddings" ADD CONSTRAINT "suburb_embeddings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suburb_embeddings" ADD CONSTRAINT "suburb_embeddings_suburb_id_suburbs_id_fk" FOREIGN KEY ("suburb_id") REFERENCES "public"."suburbs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suburb_metrics_ts" ADD CONSTRAINT "suburb_metrics_ts_suburb_id_suburbs_id_fk" FOREIGN KEY ("suburb_id") REFERENCES "public"."suburbs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suburb_metrics_ts" ADD CONSTRAINT "suburb_metrics_ts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suburbs" ADD CONSTRAINT "suburbs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_tasks_tenant_id_idx" ON "purchase_tasks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "purchase_tasks_user_id_idx" ON "purchase_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "purchase_tasks_tenant_id_status_idx" ON "purchase_tasks" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "purchase_tasks_cloned_from_task_id_idx" ON "purchase_tasks" USING btree ("cloned_from_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suburb_embeddings_suburb_kind_model_key" ON "suburb_embeddings" USING btree ("suburb_id","kind","model");--> statement-breakpoint
CREATE INDEX "suburb_embeddings_embedding_hnsw_idx" ON "suburb_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "suburb_embeddings_tenant_id_idx" ON "suburb_embeddings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "suburb_metrics_ts_observed_at_idx" ON "suburb_metrics_ts" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "suburb_metrics_ts_metric_name_observed_at_idx" ON "suburb_metrics_ts" USING btree ("metric_name","observed_at");--> statement-breakpoint
CREATE INDEX "suburb_metrics_ts_tenant_id_idx" ON "suburb_metrics_ts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suburbs_tenant_state_postcode_name_key" ON "suburbs" USING btree ("tenant_id","state","postcode","name");--> statement-breakpoint
CREATE UNIQUE INDEX "suburbs_tenant_htag_id_key" ON "suburbs" USING btree ("tenant_id","htag_id");--> statement-breakpoint
CREATE INDEX "suburbs_domain_id_idx" ON "suburbs" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "suburbs_h3_index_idx" ON "suburbs" USING btree ("h3_index");--> statement-breakpoint
CREATE INDEX "suburbs_tenant_id_idx" ON "suburbs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_external_auth_id_key" ON "users" USING btree ("external_auth_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "users_tenant_id_idx" ON "users" USING btree ("tenant_id");