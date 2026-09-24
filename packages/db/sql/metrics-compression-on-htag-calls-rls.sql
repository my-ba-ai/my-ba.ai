-- P1-0, step 3 of 3.

-- Compression back on for suburb_metrics_ts, now keyed per D40.
--
-- A segment is one series: one metric, for one suburb, property type and
-- bedroom count. property_type and bedrooms join segmentby because they are
-- now part of the series identity; leaving them out would interleave house and
-- unit readings inside one segment and make every per-series read decompress
-- both.
ALTER TABLE suburb_metrics_ts SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'suburb_id, metric_name, property_type, bedrooms',
  timescaledb.compress_orderby = 'measured_at DESC'
);
--> statement-breakpoint
-- Same 90-day policy as 0003. Note what it means under D40: a screen hydrates
-- 24 months of price history, so most rows land in chunks this policy
-- compresses on its next run, and later upserts onto those periods go through
-- Timescale's compressed-chunk DML path. Correct, a little slower. Fine at
-- cache scale; revisit if hydration latency shows up in P1-4.
SELECT add_compression_policy('suburb_metrics_ts', INTERVAL '90 days', if_not_exists => true);
--> statement-breakpoint

-- htag_calls: tenant-owned spend ledger, the same isolation policy as
-- purchase_tasks (0005). FORCE so the table owner (the migration role) is
-- subject to it too.
--
-- Grants come from 0005's ALTER DEFAULT PRIVILEGES, which covers tables the
-- migration role creates later. Granted explicitly anyway, so this table's
-- access does not depend on which role happened to run 0011.
ALTER TABLE htag_calls ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE htag_calls FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY htag_calls_isolation ON htag_calls
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON htag_calls TO my_ba_app;
