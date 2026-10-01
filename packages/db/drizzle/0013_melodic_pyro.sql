ALTER TABLE "htag_calls" ADD COLUMN "cost_source" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "htag_calls" ADD COLUMN "billed_units" integer;--> statement-breakpoint
ALTER TABLE "htag_calls" ADD COLUMN "billing_balance_aud" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "htag_calls" ADD COLUMN "billing_tier" text;--> statement-breakpoint
ALTER TABLE "htag_calls" ADD CONSTRAINT "htag_calls_cost_source_check" CHECK ("htag_calls"."cost_source" in ('header', 'config_estimate', 'none'));--> statement-breakpoint
ALTER TABLE "htag_calls" ADD CONSTRAINT "htag_calls_billing_tier_check" CHECK ("htag_calls"."billing_tier" is null or "htag_calls"."billing_tier" in ('free', 'tier1', 'tier2', 'tier3'));--> statement-breakpoint
ALTER TABLE "htag_calls" ADD CONSTRAINT "htag_calls_billed_units_check" CHECK ("htag_calls"."billed_units" is null or "htag_calls"."billed_units" >= 0);