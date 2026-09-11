# 01 — Product Overview

**Working name:** my-ba.ai
**One line:** Automates the suburb-selection and agent-outreach workflow that an Australian property investor otherwise does by hand across half a dozen websites.

## The problem

Selecting an investment property in Australia is a repetitive research pipeline: filter thousands of suburbs on rental-market metrics, check whether the promising ones are trending healthily, dig into growth drivers, find listings, find the right sales agents, then work a weekly contact cadence. Today this is done manually across DSR/HTAG, OnTheHouse, ABS, realestate.com.au and Domain. It takes days per purchase decision and doesn't reproduce.

## The manual process being automated

1. Define investment criteria (budget, target states, risk profile)
2. Screen all suburbs on rental-market metrics — vacancy rate, stock on market, renter proportion, demand-to-supply ratio
3. Trend-health check on candidates using multi-year historical data
4. Broader growth-potential analysis — demographics, family friendliness, convenience, development pipeline, demand drivers
5. Find listings in shortlisted suburbs, and find the top sales agents in those suburbs
6. Contact agents and maintain a weekly follow-up cadence

## Users

| Who | Needs | MVP status |
|---|---|---|
| **Investor** (primary) | Turn criteria into a defensible shortlist without doing the research by hand | Full workflow |
| **Sales agent** (secondary) | Claim their profile, receive qualified investor enquiries | Registration + verification only |
| **Admin/ops** (me) | Verification queue, scraper health, run diagnostics | Minimal internal tooling |

## Business model

Paid SaaS for investors, eventually. MVP has **no payment integration** — it is single-user (me) validating that the automated workflow produces shortlists I'd actually act on. Multi-tenancy is built in structurally from day one so the leap to paid users is a billing integration, not a rewrite.

The agent side is a growth loop, not a revenue line, at this stage: agents register to receive enquiries, which makes the platform more useful to investors.

## What "done" looks like for MVP

I create a Purchase Task with criteria, the system screens 7,000+ suburbs, I approve at each stage, and I end up with a web report containing a shortlist of ~6 suburbs and a list of registered agents to contact by platform-sent email.

## Glossary

| Term | Meaning |
|---|---|
| **Purchase Task** | The aggregate root. One investment search, from criteria definition through agent contact. Has a lifecycle state machine and owns every artifact produced along the way. |
| **Stage** | A step in the Purchase Task state machine (SCREENING, TREND_ANALYSIS, etc.), each executed by one agent. |
| **HITL gate** | A pause at a stage boundary waiting for human approval. Implemented as a LangGraph `interrupt()`. |
| **Autonomy config** | Per-user, per-agent-type setting controlling whether a stage pauses for approval or runs through. Overridable per-run. |
| **Lock** | When a task enters CONTACT_AGENT, its artifacts are frozen as an immutable snapshot. No re-analysis in place. |
| **Clone** | Copying a task's criteria into a fresh task to re-run the pipeline with current data. The original stays locked. |
| **HTAG** | HtAG Analytics (developer.htagai.com) — the primary Australian suburb metrics provider. REST API + native MCP server. |
| **Screening result** | A ranked suburb row produced by the Suburb Screener for a given task. |
| **Run log** | The `AnalysisSteps` record of every agent execution: inputs, outputs, tool calls, reasoning, cost. |
