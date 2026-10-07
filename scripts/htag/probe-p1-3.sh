#!/usr/bin/env bash
# P1-3 pre-merge probes against HtAG /markets/query (AC 4, AC 5; D68; Q16).
#
# Usage:  HTAG_API_KEY=... scripts/htag/probe-p1-3.sh [--dry-run]
#
# - Run locally only. The key is passed to curl via a file descriptor, so it
#   never appears in argv or output. Nothing is written to the repo: results
#   print to stdout for the PR description and Q16.
# - Spend: probes 2–3 carry an impossible `typical_price` leaf, so they return
#   0 rows and are free. Probe 1 is `limit 1` at Premium: ≤ AUD $0.121, and $0
#   if `irsad` is a decile (no row has irsad > 10).
#
# Reading the results:
#   1 irsad-gt-10       200 + 0 rows → irsad is a decile (1–10); P1-3's `irsad gte n` is right.
#                       200 + 1 row  → irsad is a raw score; minIrsadDecile must not compile as-is.
#                       400          → irsad is not a logic field; remove the leaf.
#   2 price-3y-cagr     200 → `price_3y_cagr` accepted in logic (D68 as built).
#                       400 → not a logic field; see probe 3.
#   3 price-3y-cagr-max 200 → the request field works: the fallback if probe 2 is 400 (D42 exception).
set -euo pipefail

BASE_URL="${HTAG_BASE_URL:-https://api.htagai.com/v1}"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
if [[ "$DRY_RUN" == false && -z "${HTAG_API_KEY:-}" ]]; then
  echo "HTAG_API_KEY is not set" >&2; exit 1
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# probe NAME BODY
probe() {
  local name="$1" body="$2"
  echo "→ $name"
  echo "   body: $body"
  [[ "$DRY_RUN" == true ]] && return 0

  local status
  status="$(curl -sS -X POST -D "$TMP/h" -o "$TMP/b" -w '%{http_code}' \
    -H "accept: application/json" -H "content-type: application/json" \
    -H @<(printf 'x-api-key: %s\n' "$HTAG_API_KEY") \
    --data "$body" "$BASE_URL/markets/query")"
  local cost; cost="$(tr -d '\r' < "$TMP/h" | awk -F': ' 'tolower($1)=="x-billing-cost" {print $2}')"
  local rows; rows="$(jq -r '(.results // []) | length' "$TMP/b" 2>/dev/null || echo "?")"
  echo "   status=$status rows=$rows cost=${cost:--}"
  if [[ "$status" != "200" ]]; then
    echo "   detail: $(jq -c '.detail // .message // .' "$TMP/b" 2>/dev/null | cut -c1-300)"
  fi
}

IMPOSSIBLE='{"field":"typical_price","gte":999999999}'
ALL='{"field":"bedrooms","eq":"All"}'

probe irsad-gt-10 \
  "{\"level\":\"suburb\",\"property_types\":[\"house\"],\"logic\":{\"and\":[$ALL,{\"field\":\"irsad\",\"gt\":10}]},\"limit\":1,\"offset\":0}"
probe price-3y-cagr \
  "{\"level\":\"suburb\",\"property_types\":[\"house\"],\"logic\":{\"and\":[$ALL,$IMPOSSIBLE,{\"field\":\"price_3y_cagr\",\"lte\":0.144714}]},\"limit\":5,\"offset\":0}"
probe price-3y-cagr-max \
  "{\"level\":\"suburb\",\"property_types\":[\"house\"],\"price_3y_cagr_max\":0.144714,\"logic\":{\"and\":[$ALL,$IMPOSSIBLE]},\"limit\":5,\"offset\":0}"
