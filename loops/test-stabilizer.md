---
name: test-stabilizer
title: Test stabilizer
category: Engineering
trigger: manual (run on a suite producing inconsistent results)
goal: verifiable (repeat-runs) — N consecutive full-suite runs pass
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/test-stabilizer-loop/
---

## What it does

Kills flaky tests at the root, not with retries. The agent runs your suite N times under
identical conditions and lists every test whose result changes, then fixes the most
frequent flake by its actual cause — shared state, timing, ordering, or an external
dependency — never with a blind `sleep` or retry. It re-runs that test N times, reruns
the full suite, and repeats. Each flake comes back with its root cause, the fix, the
evidence, and any justified quarantine.

## Trigger

Manual. Run it when a suite has gone non-deterministic and you need it trustworthy again.
Fill in your suite command and the streak count N before launching, with any CLI agent:

```text
claude -p "/test-stabilizer"
```

Or as a one-shot tick through the snapfix runner, overriding the agent command for this loop:

```text
node tools/loop.mjs run --agent 'claude -p "Run [test suite] [N] times under the same conditions and list tests whose result changes. Fix the most frequent flake at its root cause—shared state, timing, ordering, or an external dependency—never with a blind sleep or retry. Run that test [N] times, then rerun the full suite. Repeat until [N] consecutive full-suite runs pass, progress stalls, or approval is required. Return each flake, root cause, fix, evidence, and justified quarantine."'
```

## Goal

**Verifiable (repeat-runs).** "Done" means: N consecutive full-suite runs pass — a
deterministic streak, not a single green run. The loop also stops if progress stalls or
approval is required. The repeat-N discipline is the gate at every level: a fix isn't
trusted until the offending test passes N times in isolation *and* the whole suite then
passes N times in a row.

## Prompt

```text
Run [test suite] [N] times under the same conditions and list tests whose result changes. Fix the most frequent flake at its root cause—shared state, timing, ordering, or an external dependency—never with a blind sleep or retry. Run that test [N] times, then rerun the full suite. Repeat until [N] consecutive full-suite runs pass, progress stalls, or approval is required. Return each flake, root cause, fix, evidence, and justified quarantine.
```

## Notes / caveats

**Pick N before you start.** N controls both how confidently a flake is detected and the
bar for "stable." Too low and intermittent flakes slip through; too high and the loop
runs forever. Start around 10–20 for fast suites and tune to your tolerance and runtime.

**Quarantine is containment, not a fix.** A quarantined test is visible temporary
debt — the suite is *not* fully stabilized while any flake sits quarantined. Treat those
as a tracked follow-up, not a win, and don't let the agent quarantine its way to a green
streak.

**Token and time cost scales with N × suite runtime.** This loop reruns the whole suite
many times. On a slow suite that's expensive in wall-clock and tokens. Scope it to the
flaky module first, or run it where CI minutes are cheap.

**When NOT to use it.** Don't reach for it before you've confirmed the flake is real and
reproducible — a one-off CI blip from infra isn't a flaky test. And the no-`sleep`/no-retry
rule is the point: if you only want the red to go away, this isn't the loop.
