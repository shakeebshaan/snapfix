#!/usr/bin/env python3
# metrics_db.example.py — adapt to YOUR schema, then point metrics.config.local.json
# `dbCommand` at it (it runs on the host that can reach your DB). Prints ONE JSON
# object of real metrics to stdout. Every metric is wrapped so a single failed
# query never aborts the rest (failed -> null + an "_errors" entry). No mock data.
#
#   dbCommand: "cd ~/your_backend && ./venv/bin/python metrics_db.py 2>/dev/null | tail -1"
#
# This example assumes a `users` table (id, created_at, onboarding_complete) and a
# `user_sessions` table (user_id, last_active). Replace the SQL with your own.
import re, json
from datetime import datetime, timezone
from sqlalchemy import create_engine, text

# Resolve your DB URL however you store it (here: DATABASE_URL in a local .env).
url = re.search(r'DATABASE_URL=(.+)', open('.env').read()).group(1).strip().strip('"')
eng = create_engine(url)
out = {"_generated_at": datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), "_errors": []}

def q1(c, sql, **p):
    return c.execute(text(sql), p).scalar()

def metric(name, fn):
    try:
        with eng.connect() as c:
            out[name] = fn(c)
    except Exception as ex:
        out[name] = None
        out["_errors"].append(f"{name}: {str(ex)[:120]}")

# ---- examples — replace with your real tables/columns ----
metric("users_total",     lambda c: q1(c, "SELECT COUNT(*) FROM users"))
metric("users_new_30d",   lambda c: q1(c, "SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL 30 DAY"))
metric("dau",             lambda c: q1(c, "SELECT COUNT(DISTINCT user_id) FROM user_sessions WHERE last_active >= NOW() - INTERVAL 1 DAY"))
metric("mau",             lambda c: q1(c, "SELECT COUNT(DISTINCT user_id) FROM user_sessions WHERE last_active >= NOW() - INTERVAL 30 DAY"))

def _activation(c):
    comp = q1(c, "SELECT COUNT(*) FROM users WHERE onboarding_complete=1")
    tot  = q1(c, "SELECT COUNT(*) FROM users") or 0
    return round(100.0*comp/tot, 1) if tot else None
metric("activation_rate_pct", _activation)

# Add finance (subscriptions), AI (llm logs), support, security, social, infra…
# blocks the same way. metrics-collect.mjs maps these keys onto the dashboard
# categories; keys it doesn't find simply render as "no data".
# (See the NYUS production metrics_db.py for a full real-world reference covering
#  retention cohorts, funnel, MRR/churn, AI latency/cost, etc.)

print(json.dumps(out, default=str))
