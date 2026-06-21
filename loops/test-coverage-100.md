---
name: test-coverage-100
title: 100% test coverage
category: Engineering
trigger: manual (deliberate, bounded coverage push)
goal: verifiable — the full suite passes at 100% coverage
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/100-percent-test-coverage-loop/
---

## What it does

A goal-based agent loop that drives a test suite to 100% coverage. The agent finds uncovered code behavior, writes meaningful tests for it, and re-runs the suite — repeating until every line and branch is exercised. The stopping condition is deterministic and singular: the full test suite passes at 100% coverage. No human in the inner cycle; the coverage number is the judge.

## Trigger

Manual. Run it from your app repo against any CLI agent (bring-your-own):

```bash
claude -p "Add tests until we have 100% test coverage."
```

Or drive it through the snapfix runner as a one-shot tick, overriding the agent command for this loop:

```bash
node tools/loop.mjs run --agent 'claude -p "Add tests until we have 100% test coverage."'
```

Manual is right: a coverage push is a bounded, deliberate effort you start on purpose, not something that fires on every push.

## Goal

**Verifiable (metric).** "Done" means: the full test suite passes *and* the coverage report reads 100%. Both gate it — a green suite at 92% is not done, and 100% coverage with a red suite is not done either. The agent keeps adding tests until the coverage tool reports no uncovered lines or branches remain.

## Prompt

```text
Add tests until we have 100% test coverage.
```

## Notes / caveats

**100% is a coverage number, not a correctness proof.** The metric proves code *ran* under test, not that the assertions are *meaningful*. Skim the diff: the agent should be asserting real behavior, not padding with tests that call a function and assert nothing just to color the line green. Coverage-gaming is the failure mode here.

**Scope it or it sprawls.** Pointing this at a large untested codebase is a long, expensive run — the agent re-reads paths, adds tests, re-runs the full suite each tick. Aim it at one module or package, hit 100% there, then move on. A whole-repo run from a low baseline can burn tokens hard.

**The last few percent are the costly ones.** Defensive branches, unreachable error paths, and platform-specific code drive the agent into contortions for marginal gain. Decide up front whether a 95% practical bar beats forcing 100% with `istanbul ignore` pragmas — sometimes the honest move is to exclude the truly unreachable, not test it.

**When NOT to use it.** Skip it for throwaway scripts, and don't chase 100% as a vanity metric on code that needs *good* tests more than *complete* ones — pair it with a behavior-focused review so coverage measures quality, not just reach.
