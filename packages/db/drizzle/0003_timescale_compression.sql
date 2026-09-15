-- Compression, in its own migration on purpose.
--
-- This is the statement most likely to need adjusting for the TimescaleDB
-- version actually running: 2.18 renamed the columnstore options and keeps
-- `timescaledb.compress` as a supported alias. Isolating it means a version
-- mismatch fails here, after the hypertable itself is already committed.
--
-- Segmenting by (suburb_id, metric_name) makes a compressed segment "one
-- metric's history for one suburb", which is exactly the access pattern the
-- Trend Analyser has.
ALTER TABLE suburb_metrics_ts SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'suburb_id, metric_name',
  timescaledb.compress_orderby = 'observed_at DESC'
);
--> statement-breakpoint
-- Nothing reads raw rows older than a quarter; the analysers read aggregates.
SELECT add_compression_policy('suburb_metrics_ts', INTERVAL '90 days', if_not_exists => true);
