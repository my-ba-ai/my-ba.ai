#!/usr/bin/env bash
#
# One-time: creates the initial migration set under drizzle/.
#
# drizzle-kit owns the journal and the table DDL. The three things it cannot
# emit — CREATE EXTENSION, TimescaleDB's create_hypertable and compression
# policy, and the RLS policies and grants — are generated as `--custom`
# migrations and filled in from sql/. Ordering matters: extensions must land
# before the generated tables, because suburb_embeddings declares a `vector`
# column, and the RLS migration must land after the system tenant is seeded.
#
# After this runs, normal schema work is just `pnpm db:generate`.
#
#   pnpm install && pnpm db:bootstrap && pnpm db:migrate
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f drizzle/meta/_journal.json ]; then
  echo "drizzle/ is already bootstrapped. Use 'pnpm db:generate' for schema changes." >&2
  exit 0
fi

custom() {
  local name="$1" source="sql/$2" target
  pnpm exec drizzle-kit generate --custom --name="$name"
  target="$(find drizzle -maxdepth 1 -name "*_${name}.sql" | sort | tail -n 1)"
  if [ -z "$target" ]; then
    echo "drizzle-kit did not create a migration for '$name'" >&2
    exit 1
  fi
  cat "$source" > "$target"
  echo "  filled $target from $source"
}

custom extensions            extensions.sql
pnpm exec drizzle-kit generate --name=core_tables
custom timescale_hypertable  timescale-hypertable.sql
custom timescale_compression timescale-compression.sql
custom system_tenant         system-tenant.sql
custom rls                   rls.sql

echo
echo "Done. Review drizzle/ then run: pnpm db:migrate"
