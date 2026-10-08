-- P1-10 (D72), step 2 of 2: run after the generated migration that creates
-- abs_sal_tenure.
--
--   pnpm db:generate                                                  # table + suburbs.abs_sal_match
--   pnpm exec drizzle-kit generate --custom --name=abs_sal_tenure_rls # paste this file in
--   pnpm db:migrate
--
-- Reference data, same policies as suburbs (0005): every tenant reads the
-- system tenant's rows; writing needs app.tenant_id = system, i.e.
-- withSystemTenant. The table's CHECK pins rows to the system tenant too.
ALTER TABLE abs_sal_tenure ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE abs_sal_tenure FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY abs_sal_tenure_read ON abs_sal_tenure FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    OR tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
  );
--> statement-breakpoint
CREATE POLICY abs_sal_tenure_write ON abs_sal_tenure FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON abs_sal_tenure TO my_ba_app;
