-- Turn suburb_metrics_ts into a hypertable (D24, D27).
--
-- 30-day chunks: the refresh worker writes weekly, so a chunk holds roughly
-- four observations per suburb per metric, and a typical Screener query reads
-- one or two chunks. by_range() is the 2.13+ dimension-builder API; the older
-- positional form is deprecated.
--
-- migrate_data is true so this stays correct if the table is ever created
-- before this migration runs; on a clean database the table is empty and it
-- costs nothing.
SELECT create_hypertable(
  'suburb_metrics_ts',
  by_range('observed_at', INTERVAL '30 days'),
  migrate_data => true,
  if_not_exists => true
);
