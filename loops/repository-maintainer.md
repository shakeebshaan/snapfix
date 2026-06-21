---
name: repository-maintainer
title: Repository maintainer
category: Operations
trigger: schedule (heartbeat — wakes on a fixed cadence while maintenance is active)
goal: verifiable — every repo item is landed (tests + live proof + autoreview + green CI), decision-ready, blocked with one exact ask, or a clean no-op
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/five-minute-repository-maintainer-loop/ (generalized; snapfix scheduled variant)
---

## What it does

Keeps one or more repositories maintained on an autonomous heartbeat. On each wake the
agent triages the repo queues, reads each repository thread's latest state, and assigns
that repo's highest-value bounded task to a dedicated thread — one thread per repo, so
context survives across ticks. It works only within granted permissions and never
interrupts coherent work already in flight. Nothing lands until it has tests, live
proof, an automated code review, and green CI. Anything that needs product, access,
security, or irreversible judgment is escalated rather than guessed. It records the
meaningful changes and stops when every item is landed, decision-ready, blocked with a
clear ask, or confirmed as a no-op.

## Trigger

Scheduled, on a heartbeat. Point snapfix's runner at your agent command and let the OS
scheduler fire it on a fixed cadence (the source loop's heartbeat is five minutes; a
scheduled maintenance variant typically runs hourly or nightly):

```bash
# Print the scheduler line to install (cron on POSIX, Task Scheduler on Windows)
node tools/loop.mjs schedule --cron "0 * * * *"

# Each tick invokes your configured agentCmd once — set it to this loop:
#   qa.config.json → loop.schedule.agentCmd:
#     "claude -p \"/repository-maintainer\""
node tools/loop.mjs run
```

Use `watch --interval N --until-empty` instead of cron if you want a true heartbeat that
polls and drains the queue rather than firing on the clock.

## Goal

**Verifiable (CI).** "Done" means every repository item has reached a proven handoff or
terminal state: authorized work *landed* with evidence, or the item is decision-ready,
blocked with one exact ask, or recorded as a clean no-op. The land gate is concrete and
deterministic. Two sub-checks gate it:

- **Nothing lands without the full gate.** Tests pass, live proof exists, the autoreview
  is clean, and CI is green — all four, before merge. A green-CI-only merge isn't a
  landed item under this loop.
- **Coherent work is never interrupted.** A tick that wakes mid-task leaves it alone;
  the thread-per-repo model preserves context so the heartbeat doesn't shred in-progress
  work into amnesia.

## Prompt

```text
While repository maintenance is active, wake every five minutes. Triage [repositories] and read each repository thread's latest state. Reuse one thread per repository; assign its highest-value bounded task only within granted permissions, and do not interrupt coherent active work. Require tests, live proof, autoreview, and green CI before work can land. Escalate product, access, security, or irreversible decisions. Record meaningful changes and stop when every item is landed, decision-ready, blocked, or has no work.
```

## Notes / caveats

**This is the five-minute repository maintainer loop, scheduled.** It overlaps that
loop almost entirely — same triage, thread-per-repo, land-gate, and escalation model.
The only real difference is cadence and CI-gating: where the source runs on a tight
five-minute heartbeat, this snapfix variant fires on a slower scheduler cadence (hourly/
nightly) and leans on green CI as the hard landing gate. Pick the five-minute version
for active multi-repo days; pick this one for steady unattended upkeep.

**Permissions are the blast-radius control.** The loop acts only within granted
permissions and escalates anything irreversible, access-related, or security-sensitive.
Scope those permissions deliberately — this runs unattended across repos, and the grant
is the wall between "useful maintainer" and "autonomous agent with merge rights."

**Escalation and no-op are both finished states.** Don't treat "blocked, one exact ask"
or "no work this tick" as failures — a maintainer that knows when to stop is the point.
The loop should go quiet on a clean queue, not manufacture churn to look active.

**When NOT to use it.** Skip it on repos without real CI or without a way to produce
live proof — the land gate has nothing to stand on. And keep a human on merges for any
repo where landing is high-stakes; this loop is built to *deliver* landed work, but the
authorization to let it land at all stays your call.
