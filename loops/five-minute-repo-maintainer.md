---
name: five-minute-repo-maintainer
title: Five-minute repo maintainer
category: Engineering
trigger: schedule (wakes every 5 minutes)
goal: verifiable — every repo item is landed (green CI), decision-ready, blocked with one ask, or a clean no-op
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/five-minute-repository-maintainer-loop/
---

## What it does

A standing maintainer across one or more repositories. Every five minutes the agent wakes, triages the work, and reads each repository thread's latest state. It reuses one thread per repository, assigns that repo's highest-value bounded task within its granted permissions, and doesn't interrupt coherent active work. Nothing lands until it passes the gates — tests, live proof, autoreview, and green CI. Product, access, security, and irreversible decisions get escalated rather than guessed. It records meaningful changes and stops when every item is landed, decision-ready, blocked, or has no work.

## Trigger

Scheduled, every five minutes. Print the OS-scheduler line and install it:

```bash
node tools/loop.mjs schedule --cron "*/5 * * * *"
```

Point `qa.config.json → loop.schedule.agentCmd` at this loop's invocation (e.g. `claude -p "/five-minute-repository-maintainer"`); the runner shells out to it on each tick. Dry-run a single tick first with `node tools/loop.mjs run`.

## Goal

**Verifiable (CI).** "Done" per item means one of four proven terminal states: authorized work *landed with evidence* (green CI + live proof + autoreview), *decision-ready* (teed up for a human call), *blocked with exactly one specific ask*, or recorded as a *clean no-op*. The hard gate before anything lands: tests pass, the change is proven live, autoreview is clean, and CI is green. Each five-minute wake either advances an item toward one of those states or confirms there's no work.

## Prompt

```text
While repository maintenance is active, wake every five minutes. Triage [repositories] and read each repository thread's latest state. Reuse one thread per repository; assign its highest-value bounded task only within granted permissions, and do not interrupt coherent active work. Require tests, live proof, autoreview, and green CI before work can land. Escalate product, access, security, or irreversible decisions. Record meaningful changes and stop when every item is landed, decision-ready, blocked, or has no work.
```

## Notes / caveats

**This is an always-on, unattended scheduled loop — bound its permissions hard.** It assigns and lands work every five minutes with no human in the inner cycle. The "only within granted permissions" and "escalate irreversible decisions" clauses are the safety rails; if you don't scope what it's allowed to touch, a 24/7 cadence multiplies any mistake. Start it read-mostly and widen scope as you trust it.

**Five minutes is aggressive — most ticks should be no-ops.** The cadence is designed so work never sits long, which means the overwhelming majority of wakes find nothing to do. That's fine and cheap *if* the no-op path is fast; make sure a wake with no work exits without a full re-analysis, or token cost compounds across hundreds of daily ticks.

**"One thread per repo, don't interrupt coherent active work" is load-bearing.** It's what stops two ticks from stepping on each other or hijacking a run already in progress. Don't run this alongside other writers on the same repos without coordinating.

**When NOT to use it.** Skip it unless you genuinely need continuous multi-repo upkeep — for a single repo or occasional maintenance, a manual loop is saner. And don't point it at repos where landing requires product judgment it's told to escalate anyway; you'll just get a stream of decision-ready items.
