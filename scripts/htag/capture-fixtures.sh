#!/usr/bin/env bash
# Capture HtAG REST responses as contract-test fixtures for @my-ba/htag-client (P1-1).
#
# Usage:  HTAG_API_KEY=... scripts/htag/capture-fixtures.sh [--dry-run]
#
# - Run locally only. Never in CI. The key is read from the environment and
#   passed to curl via a file descriptor, so it never appears in argv or output.
# - Estimated spend ≈ AUD $2.50 (tiers per docs/htag/openapi.json, rates per Q13d):
#     query page 3 rows × Premium $0.121 · summary 2 × Standard $0.031 ·
#     price/rent/yield 3 × Reference $0.002 each · SOM/DOM/vacancy 3 × Restricted $0.222 each.
#   Zero-row probes and 4xx responses are free (spec: non-2xx not charged).
#   P1-10 adds two concordance calls: one Reference row (≤ $0.002) and an
#   unknown-code probe (expected 404, free).
# - HTAG_CAPTURE_ONLY=<regex> captures only fixtures whose name matches, e.g.
#   HTAG_CAPTURE_ONLY='^concordance-' to add the P1-10 fixtures without
#   re-billing the rest.
# - Writes one JSON file per call: { name, synthetic, capturedAt, request, status, headers, body }.
set -euo pipefail

BASE_URL="${HTAG_BASE_URL:-https://api.htagai.com/v1}"
OUT_DIR="${HTAG_FIXTURE_DIR:-packages/htag-client/test/fixtures}"
AREA="${HTAG_FIXTURE_AREA:-ACT101}"
ONLY="${HTAG_CAPTURE_ONLY:-}"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
if [[ "$DRY_RUN" == false && -z "${HTAG_API_KEY:-}" ]]; then
  echo "HTAG_API_KEY is not set" >&2; exit 1
fi

mkdir -p "$OUT_DIR"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# capture NAME METHOD PATH QUERY BODY [KEY_OVERRIDE]
capture() {
  local name="$1" method="$2" path="$3" query="$4" body="$5" key="${6:-${HTAG_API_KEY:-}}"
  local url="$BASE_URL$path${query:+?$query}"
  if [[ -n "$ONLY" && ! "$name" =~ $ONLY ]]; then return 0; fi
  echo "→ $name: $method $path${query:+?$query}"
  [[ "$DRY_RUN" == true ]] && return 0

  local args=(-sS -X "$method" -D "$TMP/h" -o "$TMP/b" -w '%{http_code}'
              -H "accept: application/json" -H @<(printf 'x-api-key: %s\n' "$key"))
  [[ -n "$body" ]] && args+=(-H "content-type: application/json" --data "$body")
  local status; status="$(curl "${args[@]}" "$url")"

  # Response headers only, allow-listed to what the client reads. Tracing headers
  # (x-amz-apigw-id, x-amzn-requestid, …) are dropped: they are noise, and their
  # random values trip gitleaks' generic-api-key rule. The request key is never written.
  local headers
  headers="$(tr -d '\r' < "$TMP/h" | awk -F': ' 'NR>1 && NF>1 {print tolower($1) "\t" substr($0, length($1)+3)}' \
    | grep -E '^(content-type|retry-after|x-billing-[a-z-]+|x-ratelimit-[a-z-]+)'$'\t' \
    | jq -Rn '[inputs | split("\t") | {(.[0]): .[1]}] | add // {}')"
  local body_json; body_json="$(jq -c . "$TMP/b" 2>/dev/null || jq -Rs . "$TMP/b")"

  jq -n --arg name "$name" --arg method "$method" --arg path "$path" --arg query "$query" \
        --arg reqBody "$body" --argjson status "$status" --argjson headers "$headers" \
        --argjson body "$body_json" --arg at "$(date -u +%FT%TZ)" '
    { name: $name, synthetic: false, capturedAt: $at,
      request: { method: $method, path: $path,
                 query: (if $query == "" then null else $query end),
                 body: (if $reqBody == "" then null else ($reqBody | fromjson) end) },
      status: $status, headers: $headers, body: $body }' > "$OUT_DIR/$name.json"
  echo "   $status  cost=$(jq -r '.headers["x-billing-cost"] // "-"' "$OUT_DIR/$name.json")"
}

Q_ZERO='{"level":"suburb","property_types":["house"],"logic":{"and":[{"field":"bedrooms","eq":"All"},{"field":"typical_price","gte":999999999}]},"limit":5,"offset":0}'
Q_STATE='{"level":"suburb","property_types":["house"],"logic":{"and":[{"field":"bedrooms","eq":"All"},{"field":"typical_price","gte":999999999},{"field":"state","in":["QLD"]}]},"limit":5,"offset":0}'
Q_PAGE='{"level":"suburb","property_types":["house"],"logic":{"and":[{"field":"bedrooms","eq":"All"},{"field":"typical_price","gte":100000,"lte":550000}]},"limit":3,"offset":0}'
Q_BAD='{"level":"suburb","property_types":["house"],"logic":{"field":"not_a_real_field","eq":1},"limit":1,"offset":0}'

# Free
capture query-zero-rows      POST /markets/query "" "$Q_ZERO"
capture query-state-probe    POST /markets/query "" "$Q_STATE"            # Q16: is `state` accepted?
capture query-400            POST /markets/query "" "$Q_BAD"
capture query-401            POST /markets/query "" "$Q_ZERO" "invalid-key-for-fixture"
capture trends-price-400     GET  /markets/trends/price "level=not_a_level&area_id=$AREA" ""
# Billed
capture query-page           POST /markets/query "" "$Q_PAGE"
capture summary              GET  /markets/summary "level=suburb&area_id=$AREA&property_type=house&bedrooms=All&limit=2" ""
for m in price rent yield; do
  capture "trends-$m"        GET  "/markets/trends/$m" "level=suburb&area_id=$AREA&property_type=house&bedrooms=All&limit=3" ""
done
for m in stock-on-market days-on-market vacancy; do
  capture "trends-$m"        GET  "/markets/trends/$m" "level=suburb&area_id=$AREA&property_type=house&limit=3" ""
done

# P1-10 (D72): bare-object response; an unknown code settles what "no locality" looks like.
capture concordance-sal-to-locality         GET /reference/concordance/sal-to-locality "sal_code=SAL13714" ""
capture concordance-sal-to-locality-unknown GET /reference/concordance/sal-to-locality "sal_code=SAL99999" ""

if [[ "$DRY_RUN" == false ]]; then
  # Belt and braces: the key must not appear anywhere in the fixtures.
  if grep -rqF -- "$HTAG_API_KEY" "$OUT_DIR"; then
    echo "API key found in fixtures — deleting output" >&2; rm -f "$OUT_DIR"/*.json; exit 1
  fi
  echo "Total charged: AUD $(jq -s '[.[].headers["x-billing-cost"] // "0" | tonumber] | add' "$OUT_DIR"/*.json)"
fi
