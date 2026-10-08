# @my-ba/db

Drizzle schema, migrations, and the tenant-scoped access primitives. Depended on
by `apps/api`, `apps/worker`, and (from P0-5) the LangGraph checkpointer — which
is why it is a package and not a folder inside `apps/api` (D37).

## Layout

```shell
src/schema/     One file per table. The source of truth for both types and DDL.
src/client.ts   Pool factory + drizzle instance.
src/tenant.ts   withTenant() / withSystemTenant() — the only sanctioned way in.
src/scripts/    migrate.ts, run by `pnpm db:migrate`.
sql/            Every hand-written `.sql`: custom-migration sources (D42) and
                `postgres-init.sql`, the container init that creates `my_ba_app`.
drizzle/        Generated migrations + journal. Do not edit applied files.
pgadmin-servers.json  Connections pgAdmin pre-registers (`pnpm db:admin`, root README).
```

## pgvector

The extension is created in migration `0000` and nothing uses it yet. It is
there for agent memory (D24, `docs/02`), whose shape is a Phase 2 question.
P0-2 briefly carried a `suburb_embeddings` table to prove the extension worked;
it did — `0001` built an HNSW index against the real image — and the table was
dropped in `0007` (D44) rather than left in the schema implying a feature that
does not exist.

## Changing the schema

```bash
# edit src/schema/*.ts, then:
pnpm db:generate
pnpm db:migrate
```

Never hand-write a `CREATE TABLE`. The exceptions — `CREATE EXTENSION`,
TimescaleDB's `create_hypertable` and compression policies, RLS policies and
grants — have no Drizzle representation, so they go in as
`drizzle-kit generate --custom` migrations and the SQL is kept in `sql/` (D42).
Editing an already-applied migration breaks its checksum; write a new one.

## Two roles, on purpose

| Connection               | Role                                   | Used by                        |
| ------------------------ | -------------------------------------- | ------------------------------ |
| `DATABASE_URL`           | `my_ba_app` — NOSUPERUSER, NOBYPASSRLS | apps/api, apps/worker          |
| `DATABASE_MIGRATION_URL` | schema owner                           | `pnpm db:migrate`, drizzle-kit |

Postgres RLS is bypassed by superusers unconditionally. If the app connected as
`postgres`, every tenant policy would be inert and, with one tenant in the
database, nothing would look wrong. `GET /api/health/db` reports `rlsEnforced`
so this fails loudly instead of silently (D40).

## Tenant scoping

```ts
const tasks = await withTenant(db, tenantId, async (tx) => tx.select().from(purchaseTasks))
```

`withTenant` sets `app.tenant_id` **transaction-locally**. A pooled connection
outlives the request that borrowed it, so a session-level setting would leak one
tenant's scope into the next request on that socket.

Outside a `withTenant` block the app role sees an empty database. That is
deliberate: a query that forgets its tenant returns nothing rather than
everything.

Reference data — `suburbs` and `suburb_metrics_ts` — belongs to a system tenant
that every tenant can read and only `withSystemTenant` can write (D38). That is how D26's "`tenant_id` on every table" is honoured without
copying 7,000 suburbs per tenant or making the column nullable.

## abs_sal_tenure (P1-10, D72)

ABS 2021 Census tenure per Suburb and Locality, system-tenant reference data
with the same RLS as `suburbs`. Loaded once per Census, not on a schedule:

```bash
# download 2021_GCP_SAL_for_AUS_short-header.zip into data/abs/ (gitignored), then
pnpm abs:load
```

The loader checks the file against a pinned size and SHA-256 before parsing,
and a re-run writes nothing. `suburbs.abs_sal_code` is filled lazily by
`resolvePendingSuburbs` / `createSalResolver`: name match within the state
first, HtAG concordance only for ambiguous names; `abs_sal_match` records how
(or `unmatched`), so nothing is paid for twice.

## suburb_metrics_ts

A TimescaleDB hypertable, 30-day chunks, ranged on `measured_at` (HtAG
`period_end`). It is the per-suburb on-demand hydration cache (D40), keyed the
way HtAG bills: primary key `(suburb_id, property_type, bedrooms, metric_name,
measured_at)`, which is also the upsert target. It's long-format (`metric_name`,
`value`) because HtAG's metric set is not ours to freeze. Timescale rejects any
unique index that omits the partitioning column; a test enforces it.

**Changing its columns or key (D60).** Compression blocks PK and
partitioning-column changes, so a change ships as three migrations:

```bash
pnpm exec drizzle-kit generate --custom --name=metrics_compression_off   # fill from sql/metrics-compression-off.sql
pnpm db:generate                                                           # the real delta
pnpm exec drizzle-kit generate --custom --name=metrics_compression_on    # re-enable, see sql/metrics-compression-on-htag-calls-rls.sql
```

The off-step truncates the table. That's safe only while it is a re-fetchable
cache.

**This is the one table with no RLS** (D43). TimescaleDB does not support row
level security on compressed chunks, so the two cannot coexist here. Compression
wins, because the table holds only system-tenant reference data that every
tenant reads by design — the policy was protecting nothing. `tenant_id` stays
NOT NULL, and a CHECK constraint pins every row to the system tenant so the
table cannot quietly start holding tenant-private data. A test guards the
constraint, because deleting it would silently reopen the hole.
