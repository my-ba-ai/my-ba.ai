# 06 — Data Sources & Compliance

## Why this file exists

Data access is the single biggest constraint on this product. The Australian property data landscape is gated: most providers require sales conversations and per-deal quotes, and scraping the major portals carries real legal exposure. Every architectural decision downstream of ingestion is shaped by what we can legitimately get.

## Sources

### HTAG Analytics — primary
- Portal: `developer.htagai.com`
- Coverage: ~7,000+ Australian suburbs, 150+ metrics
- Interfaces: REST API **and** a native MCP server
- Historical time-series: confirmed available (tier and rate limits still **OPEN — Q01**)
- Role: suburb metrics for the Screener, historical data for the Trend Analyser, contextual metrics for the Growth Analyser
- Pattern: MCP server for the agents in-conversation; REST for application code (workers, dashboards). Use both.
- Geo indexing: H3 — must map to the canonical suburb entity

### Domain API — property level
- Self-serve developer portal with sandbox → production flow (the only major AU provider with self-serve keys)
- Property Package API: address suggestions, sales history, price estimates
- Role: listings for the Property Scout, sales history for the Growth Analyser

### RateMyAgent via Apify — agent data
- Apify actor returns ~38,000 AU agents: name, agency, suburb, star rating, review count, sold count, median sale price, specialties, phone/email on ~99% of rows
- Pricing around $3 per 1,000 agents
- Role: seeds `ScrapedAgents` + `Agencies`; the fuzzy-match target for agent profile claims
- **Exposure:** scraped data. No redistribution, attribution where displayed, and this needs a proper legal review before the platform is public

### ABS Census — demographics
- Ingested as a **static snapshot**, not a live API dependency (D28)
- SA2-level Census DataPacks, CSV
- One-time ETL + annual refresh
- Role: Growth Potential Analyser — family friendliness, age distribution, household composition

### State license registers — deferred
- 8 states/territories, each with a different portal (NSW `verify.licence.nsw.gov.au`, VIC Consumer Affairs, QLD Office of Fair Trading, etc.)
- Almost all are web forms, not APIs. Automating means browser automation — fragile and ToS-exposed
- Commercial aggregators exist (FrankieOne and similar) but are priced for financial services
- **MVP: manual verification queue.** Self-declared license at registration, "Verified" badge after admin review

## Explicitly rejected

| Source | Why rejected |
|---|---|
| DSR Data / Suburb Analyser | No public API. Web interface behind login, Lite/Pro memberships only, no developer tier. Replaced by HTAG |
| realestate.com.au scraping | Legally risky — REA Group has litigated over listing scraping |
| Pricefinder / PropTrack / Cotality | Sales-gated, per-deal quotes. Not viable for a pre-revenue MVP |

## Normalisation

Every source uses different suburb identifiers. One canonical `Suburbs` table holds the internal ID plus `htag_id`, `domain_id`, H3 index, and postcode + state as fallback matching keys. Nothing downstream of ingestion should ever see an external ID.

## Cost control

The dominant cost risk is metered API calls. Mitigations:
- Weekly full refresh of suburb metrics into TimescaleDB; screening reads the local cache
- Live HTAG calls only for the ~10–20 shortlisted suburbs in Trend/Growth analysis
- Redis caching on all external client responses
- Agent scrape runs on a schedule, not per-task

## Compliance checklist

- **Spam Act 2003 (Cth)** — platform-sent outreach email requires consent basis, accurate sender identification, and a functional unsubscribe. Build into the send path, not as a later retrofit. Keep a suppression list.
- **Privacy Act** — agent contact details from scraped sources are personal information. Understand the obligations before the platform is public.
- **Third-party ToS** — HTAG, Domain and Apify each have terms governing caching, storage duration and redistribution. Read them before the weekly refresh job goes live.
- **Not financial advice** — the product surfaces data and analysis; it must not read as personal investment advice. Disclaimers in the report view.
