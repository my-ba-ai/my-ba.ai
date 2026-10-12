-- P1-4 (D73), step 2 of 2. SQL kept in sql/analysis-steps-screening-results-rls.sql (D42).

-- Tenant-owned, the same isolation policy as purchase_tasks (0005) and
-- htag_calls (0012). FORCE so the table owner is subject to it too.
ALTER TABLE analysis_steps ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE analysis_steps FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY analysis_steps_isolation ON analysis_steps
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON analysis_steps TO my_ba_app;
--> statement-breakpoint
ALTER TABLE screening_results ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE screening_results FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY screening_results_isolation ON screening_results
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON screening_results TO my_ba_app;
