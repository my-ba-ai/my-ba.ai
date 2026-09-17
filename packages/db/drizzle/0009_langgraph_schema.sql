-- LangGraph checkpoint schema (P0-5, D51).
--
-- Drizzle owns the schema and its privileges; PostgresSaver.setup() owns the
-- tables inside it and versions them in langgraph.checkpoint_migrations
-- (`pnpm db:migrate` runs setup right after this journal). Those tables are the
-- one carve-out from "tenant_id on every table": the library defines their
-- shape, so tenant scope is carried in thread_id
-- ("tenant:<uuid>:task:<uuid>:stage:<name>") instead, and no RLS applies.
--
-- my_ba_app gets DML only. It never runs setup() and cannot create objects here.

CREATE SCHEMA IF NOT EXISTS langgraph;
--> statement-breakpoint
REVOKE ALL ON SCHEMA langgraph FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA langgraph TO my_ba_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA langgraph
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO my_ba_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA langgraph
  GRANT USAGE, SELECT ON SEQUENCES TO my_ba_app;
