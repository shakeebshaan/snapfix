---
name: post-release-baseline
title: Post-release baseline
category: Operations
trigger: schedule (action/post-release — fires when a release completes)
goal: verifiable — benchmark results are verified and marked the new baseline, prior baseline preserved until confirmed
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/post-release-baseline-loop/
---

## What it does

After a release finishes, an agent runs your standard benchmarks against the shipped
build and records the results as the new performance baseline — the reference line
every future regression check measures against. It confirms the release is actually
complete first, runs the benchmarks under documented conditions, investigates any
invalid or anomalous result rather than recording it, and stores the final numbers
linked to the release identity and benchmark metadata. Crucially, it does not
overwrite the previous baseline until the new results are verified — so a botched run
can't silently corrupt your reference point.

## Trigger

Scheduled, fired on release completion. Wire it to your release pipeline (or a cron
that watches for a release tag) and point snapfix's runner at your agent command:

```bash
# Print the scheduler line to install (cron on POSIX, Task Scheduler on Windows)
node tools/loop.mjs schedule --cron "0 4 * * *"

# Each tick invokes your configured agentCmd once — set it to this loop:
#   qa.config.json → loop.schedule.agentCmd:
#     "claude -p \"/post-release-baseline\""
node tools/loop.mjs run
```

Best driven straight off the release event rather than a wall-clock time — the loop's
own first step is to confirm the release is done, so fire it when it is.

## Goal

**Verifiable (metric).** "Done" means the benchmark results are verified and marked as
the new baseline, with the release identity and benchmark metadata attached. The
stopping condition is a stored, verified baseline — not a raw run. Two sub-checks gate
it:

- **Anomalies are investigated, not recorded.** An invalid or wildly-off result is
  chased down before anything is stored — a bad number becomes a poisoned reference for
  every future comparison.
- **The old baseline survives until confirmation.** The previous baseline is preserved
  until the new one is verified. No half-written overwrite can destroy your last good
  reference point.

## Prompt

```text
After current releases finish, run the standard benchmarks and record the results as the new baseline.
```

## Notes / caveats

**Conditions must be documented and constant.** A baseline is only meaningful if the
next run is comparable — same hardware, same dataset, same warmup, same concurrency.
Pin the benchmark conditions in metadata or your "regression" signal is just
environment noise.

**This sets the line; it doesn't watch it.** This loop records *where you are* after a
release. Pair it with a regression-detection loop that compares each later build
against this stored baseline — the baseline is inert until something measures against
it.

**Confirm the release is truly done.** Fire it too early — mid-deploy, before assets
settle — and you benchmark a half-shipped build and enshrine garbage as truth. The
"confirm release complete" step is load-bearing; don't skip it for a faster trigger.

**When NOT to use it.** Skip it if you have no stable benchmark suite or no fixed
environment to run it in — without those, every "baseline" measures the weather, not
the release.
