-- Extensions, before anything that depends on them (D24).
--
-- Runs first so the generated core-tables migration can declare a `vector`
-- column. timescale/timescaledb-ha may already have created timescaledb from
-- template1, hence IF NOT EXISTS.
CREATE EXTENSION IF NOT EXISTS timescaledb;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;
