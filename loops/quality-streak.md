---
name: quality-streak
title: Quality streak
category: Evaluation
trigger: manual (you decide when to spend a full streak run)
goal: verifiable — N consecutive scenarios pass the original bar with zero failures in between
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/quality-streak-loop/
---

## What it does

Runs realistic scenarios one at a time and counts a *streak* of consecutive passes. The first time a scenario fails, the agent documents it, adds regression and benchmark coverage for it, fixes the root cause — and resets the streak to zero. Then it starts counting again. It keeps going until **N cases in a row** clear the original quality bar. The reset is the whole point: it stops an intermittent weakness from hiding behind a run of lucky successes, and every failure permanently hardens the test suite on the way through.

## Trigger

Manual. Kick it off when "passes sometimes" isn't good enough and you need *proven consecutive* reliability. Any CLI agent works — bring-your-own:

```bash
claude -p "Test realistic scenarios. When one fails, document it, add regression and benchmark coverage, fix it, and restart the streak. Stop after 20 successful cases in a row."
```

Replace the count with your real N before running. No schedule/watch wiring — streaks reset on every failure, so wall-clock cost is open-ended; a human picks when to pay for it.

## Goal

**Verifiable.** "Done" means: **N scenarios in a row** pass the original bar with no failure interrupting the run. The counter is the contract — a single failure anywhere in the streak sends it back to zero, no partial credit. Two sub-checks gate each pass:

- **Every failure adds coverage before it's fixed** — a regression test plus a benchmark case, so the same weakness can never silently return mid-streak.
- **The bar is the *original* bar** — fixed up front, held constant; you don't relax it to close out a stubborn streak.

## Prompt

```text
Test realistic scenarios. When one fails, document it, add regression and benchmark coverage, fix it, and restart the streak. Stop after [N] successful cases in a row.
```

## Notes / caveats

**Pick N for the reliability you actually need.** A streak of 5 is a smoke check; 50 is a hard reliability gate. Cost is non-linear — the deeper an intermittent bug hides, the more resets you'll eat, and each reset throws away every pass before it. Set N to the confidence you need, not the biggest number you can imagine.

**Best on flaky/intermittent classes of bug.** This loop earns its cost where success is *probabilistic* — race conditions, retry logic, anything that passes 9 times then bites on the 10th. For a deterministic bug that fails every time, you don't need a streak; the fix-issues loop is far cheaper.

**The growing suite is a real deliverable.** Unlike a one-shot sweep, every failure leaves behind a regression + benchmark case that outlives the run. Budget for the suite getting slower as it grows, and prune dead cases later.

**When NOT to use it.** Skip it if you can't hold the bar fixed for the whole run (a moving bar makes the streak meaningless), if your scenarios aren't reproducible enough to trust a pass, or for a single deterministic bug — reach for fix-issues instead.
