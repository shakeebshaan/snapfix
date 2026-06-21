---
name: test-suite-speed
title: Test-suite speed
category: Engineering
trigger: manual (deliberate optimization pass)
goal: verifiable — runtime target hit (or diminishing returns) with all checks still green
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/test-suite-speed-loop/
---

## What it does

Drives a slow test suite faster without weakening it. The agent profiles the suite to find the bottlenecks, applies incremental optimizations — parallelism, shared fixtures, killing redundant setup, replacing sleeps with waits — and re-measures each tick. It stops when it hits a runtime target or runs into diminishing returns, with coverage, assertions, isolation, and observable behavior all unchanged. Speed is the goal; the existing checks are the guardrail.

## Trigger

Manual. Run it from your repo against any CLI agent (bring-your-own):

```bash
claude -p "Optimize the test suite to run as quickly as possible without reducing coverage or changing behavior."
```

Or drive it through the snapfix runner as a one-shot tick, overriding the agent command for this loop:

```bash
node tools/loop.mjs run --agent 'claude -p "Optimize the test suite to run as quickly as possible without reducing coverage or changing behavior."'
```

Manual is right: you reach for this when the suite has gotten painfully slow, not on a schedule.

## Goal

**Verifiable (metric).** "Done" means: wall-clock runtime hits your target *or* further optimization yields diminishing returns — and the suite still passes with the same coverage, the same assertions, and proper test isolation intact. Two sub-checks gate it: coverage must not drop, and tests must stay isolated (no shared mutable state quietly introduced for speed). A faster suite that tests less is a regression, not a win.

## Prompt

```text
Optimize the test suite to run as quickly as possible without reducing coverage or changing behavior.
```

## Notes / caveats

**Set the target, or "as fast as possible" never terminates.** Give it a concrete floor — "under 60s" or "halve the current time" — so the loop has a stopping line. Without one it chases milliseconds into diminishing returns and burns tokens for nothing.

**Watch for isolation traded away for speed.** The fastest "optimization" is often the wrong one: sharing state between tests, dropping `beforeEach` resets, or running things in parallel that mutate the same fixture. That buys speed and pays in flakiness. Review the diff — isolation is a contract, not overhead.

**Coverage is the floor; assertions are the silent risk.** A run can keep coverage identical while quietly weakening what the tests *assert*. Confirm the suite still fails when it should — re-introduce a known bug and check it's caught, or trust this less.

**When NOT to use it.** Skip it if the suite is slow because it's doing real integration work you actually need — speed isn't free there. And don't run it on a flaky or red suite first; stabilize, then optimize.
