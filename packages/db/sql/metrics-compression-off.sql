-- P1-0, step 1 of 3: switch compression off so the generated migration (0011)
-- can rekey suburb_metrics_ts.
--
-- TimescaleDB refuses to drop or add a primary key, and to change the
-- partitioning column, on a hypertable with compression enabled. drizzle-kit
-- cannot emit any of this, so it brackets the generated migration: this file
-- before it, 0012 after it. Any future change to this table's columns or key
-- needs the same pair.
--
-- TRUNCATE is deliberate. The table is a hydration cache (D40): every row can
-- be re-fetched from HtAG, and nothing wrote to it before P1-0 (the refresh
-- worker, P1-2, was retired). Truncating drops every chunk, compressed or not,
-- so there is nothing to decompress, and the new NOT NULL `property_type`
-- column in 0011 needs no backfill value that would be a guess.
SELECT remove_compression_policy('suburb_metrics_ts', if_exists => true);
--> statement-breakpoint
TRUNCATE suburb_metrics_ts;
--> statement-breakpoint
ALTER TABLE suburb_metrics_ts SET (timescaledb.compress = false);
