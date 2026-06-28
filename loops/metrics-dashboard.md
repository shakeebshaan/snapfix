---
name: metrics-dashboard
title: Real-data metrics dashboard
category: Analytics
trigger: schedule (cron — refreshes the board's Metrics tab unattended)
goal: verifiable — every tracked KPI is either a fresh real value or flagged "awaiting" with exact setup steps; no mock numbers
source: deep-research "missing metrics" report (product/growth/finance/AI/infra/…)
---

## What it does

Turns the board into a live business dashboard. On a schedule, a collector pulls
**real** numbers from your own sources — product DB, GA4, app stores, prod health,
billing — assembles them into `metrics.json`, and the board's **Metrics tab**
renders them by category (Product & Growth, Finance, AI System, Marketing/SEO/AEO,
App Store, Health-Data, Social, Support, Security, Infrastructure, Analytics,
Engagement, Competitors/Legal).

Two rules keep it honest:

1. **Real data only.** A metric shows a number only when it came from a live
   source. Anything not yet wired renders as **`awaiting`** with a one-line
   `need:` telling you exactly what to connect (a credential, an API, an event) —
   never a placeholder number.
2. **Sensitive by default.** `metrics.json` (revenue, user counts, cost) is
   uploaded to the **private** companion repo and the board fetches it
   client-side with your token — the same model as private screenshots. It is
   never committed to the public board repo.

## Trigger

Scheduled. Install a cron / Task Scheduler line that runs the collector and lets
the board pick up the refreshed `metrics.json`:

```bash
# dry-run one refresh by hand first
node tools/metrics-collect.mjs

# then schedule it (quietest hour; hourly/daily as you like)
node tools/loop.mjs schedule --cron "7 * * * *" \
  --agent 'node tools/metrics-collect.mjs'
```

## Setup

1. Copy `tools/metrics.config.example.json` → `data/metrics.config.local.json`
   (gitignored) and fill in your SSH host + key + DB query command, GA4 property +
   service-account JSON, and the private repo name.
2. Adapt `tools/metrics_db.example.py` to your schema — it runs on the host that
   can reach your DB and prints a JSON object of real metrics. Each metric is
   wrapped in try/except so one failed query never aborts the rest.
3. `node tools/metrics-collect.mjs` merges DB + GA4 + health into `metrics.json`
   and uploads it to the private repo. Open the board → **Metrics**.

## Goal

Verifiable: after each run, `metrics.json.summary` reports `{total, live,
awaiting}`. The loop's job is to maximize `live` over time — every `awaiting`
metric is also filed on the board as an issue with step-by-step setup
instructions, so the owner can knock them out one by one until the dashboard is
fully real.

## Why it matters

Most dashboards cover vanity basics (visits, followers) and miss the metrics that
actually run the business: activation, D1/D7/D30 retention, funnel conversion,
MRR/churn/ARPU, AI latency/cost/error rate, store conversion, SEO/AEO signals,
support and security health. This loop makes all of them first-class — and makes
the gaps explicit instead of invisible.
