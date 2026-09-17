# 03 — Domain Model

## Purchase Task state machine

```
DRAFT              user defines criteria
  ↓
SCREENING          Suburb Screener → all 7,000+ suburbs from local cache
  ↓                → ~142 candidates
TREND_ANALYSIS     Trend Analyser → historical time-series, stability
  ↓                → ~18 suburbs
GROWTH_ANALYSIS    Growth Analyser → demographics, drivers, dev pipeline
  ↓                → ~6 suburbs
PROPERTY_SCOUTING  Property Scout → Domain listings, ranked
  ↓
AGENT_DISCOVERY    Agent Discovery → top 10 registered agents per suburb
  ↓
CONTACT_AGENT      *** DATA LOCKED *** outreach emails sent
  ↓
IN_PROGRESS        negotiation, offer tracking
  ↓
CLOSED             won / lost / abandoned
```

Every transition is a gate. If autonomy config says HITL for that stage, the graph interrupts and writes an `AnalysisSteps` row with `requires_approval = true, status = 'pending'`.

The whole pipeline runs on task creation with data current at that moment. There is no background re-screening.

## Locking

On transition to `CONTACT_AGENT`:

- `PurchaseTasks.locked_at` is set
- The full artifact payload is snapshotted into `TaskArtifacts` — not just flagged

**Why a snapshot rather than a flag:** if the scoring algorithm changes or HTAG data refreshes, a locked task must still show exactly what I saw when I contacted the agents. The report I acted on is the record.

## Cloning

To re-run with fresh data, clone the task: new task ID, same criteria, full pipeline re-runs, no lock until it reaches CONTACT_AGENT. The original stays locked and intact. This is cleaner than unlock-and-rerun because outreach threads and agent relationships are tied to the original task.

Cloning is also the ergonomic path for the common real case: the same investor with the same risk criteria starting a new search.

## Entities

```
Suburbs (canonical)
  id, h3_index, name, state, postcode, htag_id, domain_id

SuburbMetricsTS                      -- TimescaleDB hypertable
  suburb_id, metric_name, timestamp, value

Users
  id, email, tenant_id, role                -- role: investor | agent | admin

AutonomyConfig
  user_id, agent_type, autonomy_level       -- auto | hitl

PurchaseTasks                        -- AGGREGATE ROOT
  id, user_id, tenant_id, name, status, criteria_json,
  locked_at, locked_snapshot_id, cloned_from_task_id, created_at

TaskArtifacts
  id, task_id, stage, artifact_type, payload_json, created_at
  -- immutable once task.locked_at is set

ScreeningResults
  id, task_id, suburb_id, score, score_breakdown_json, passed, excluded_by_user

AnalysisSteps                        -- run log + approval gates
  id, task_id, agent_type, stage, input_json, output_json, reasoning,
  tool_calls_json, token_usage, cost, status,
  requires_approval, approved_by, approved_at, rejection_reason

Agencies
  id, name, state, suburb, domain_agency_id

ScrapedAgents
  id, name, agency_id, suburb, rating, review_count, sold_count,
  median_sale_price, specialties, phone, email, source, scraped_at

AgentProfiles                        -- registered agent users
  id, user_id, scraped_agent_id (nullable), agency_id,
  license_number, license_state, verification_status,
  display_name, bio, photo_url

TaskAgentContacts
  id, task_id, agent_profile_id, status, contacted_at, last_response_at

OutreachEmails
  id, task_agent_contact_id, subject, body, sent_at,
  unsubscribe_token, delivery_status
```

## Ranking function

Agent ranking is a pure, testable module — no LLM involved:

```
score = 0.4 × normalised(rating)
      + 0.3 × normalised(log(review_count))
      + 0.3 × normalised(recent_sold_count)
```

Filtered to agents whose primary suburb matches, and to registered agents only (unregistered agents are not selectable).

## Agent identity

Two registration paths:

1. **Claim an existing profile** — fuzzy match on name + agency + suburb against `ScrapedAgents`, present top 3 candidates, agent confirms.
2. **New agent** — self-declared license number + state, `verification_status = 'self_declared'`, queued for manual admin review.

Automated license verification across 8 states/territories is deferred. Most state registers are web forms, not APIs; automating them means brittle browser automation with ToS exposure. MVP ships with a manual verification queue and a "Verified" badge only after review.

## Autonomy config resolution

```
per-run override  →  per-agent-type override  →  global default
```

MVP default is **HITL everywhere**. Autonomy becomes a meaningful product feature only when external users arrive; until then it's a config layer that must exist structurally but is never set to `auto`.
