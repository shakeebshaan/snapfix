---
name: revolve-versioned-experiment
title: Revolve versioned experiment
category: Evaluation
trigger: manual (hypothesis-testing where you want resumability and rollback)
goal: verifiable — keep only a clear, regression-free win measured against a frozen baseline; stop on success, no progress, blocker, or budget
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/revolve-self-improvement-loop/
---

## What it does

Improves a prompt, code path, or any testable subject through **checkpointed experiments** whose scores stay comparable across sessions. In a `revolve/` workspace, the agent defines the goal and a budget, **freezes the tests and scoring**, checkpoints the current version, and records a **baseline**. Each round tests exactly one hypothesis and keeps only a **clear, regression-free win**. If the evaluation itself changes, it opens a new revision and re-runs the baseline so scores never silently drift. It asks before touching live files, and stops on success, no progress, a blocker, or an exhausted budget — returning the best checkpoint, comparisons, a rollback, and a next action.

## Trigger

Manual. Reach for it when you want to test hypotheses *and* be able to resume or revert later — experiments you'll come back to across sessions. Any CLI agent works — bring-your-own:

```bash
claude -p "Use Revolve to improve a support prompt, code path, or testable subject. In revolve/, define the goal and a budget, freeze the tests and scoring, checkpoint the current version, and record a baseline. Each round, test one hypothesis; keep only a clear, regression-free win. If the evaluation changes, open a new revision and rerun the baseline. Ask before changing live files. Stop on success, no progress, a blocker, or exhausted budget. Return the best checkpoint, comparisons, rollback, and next action."
```

No schedule/watch wiring — it's a human-initiated experiment with a rollback path.

## Goal

**Verifiable.** "Done" means: the loop returns the **best checkpoint**, where every kept change was a *clear, regression-free win* measured against the frozen baseline — or it stops honestly at no progress, a blocker, or exhausted budget. The frozen scoring is the contract: a win is only a win if the baseline says so. Two sub-checks gate it:

- **Tests and scoring are frozen** — comparisons are meaningless if the yardstick moves; change the evaluation only by opening a new revision and re-running the baseline.
- **Only regression-free wins survive** — a change that improves one metric while breaking another is not kept; rollback to the prior checkpoint is always available.

## Prompt

```text
Use Revolve to improve a support prompt, code path, or testable subject. In revolve/, define the goal and [budget], freeze the tests and scoring, checkpoint the current version, and record a baseline. Each round, test one hypothesis; keep only a clear, regression-free win. If the evaluation changes, open a new revision and rerun the baseline. Ask before changing live files. Stop on success, no progress, a blocker, or exhausted budget. Return the best checkpoint, comparisons, rollback, and next action.
```

## Notes / caveats

**Frozen scoring + checkpoints = comparable across sessions.** This is the distinguishing feature: because the tests and scoring are frozen and every version is checkpointed against a recorded baseline, a score from today is directly comparable to one from last week. The moment you need to change the evaluation, you open a new revision and re-baseline — drift is structurally prevented, not hoped against.

**Versus the self-improving champion loop.** Both optimize a testable subject and promote only wins. Champion emphasizes a holdout split to fight *overfitting*; Revolve emphasizes *resumability and reversibility* — checkpoints, revisions, and a rollback you can take across sessions. Pick Revolve when you'll step away and come back; pick champion when overfitting to your working set is the bigger risk.

**Asks before changing live files.** It stages in `revolve/` and pauses before touching anything live. Keep that gate — the rollback it returns is only useful if live state wasn't mutated out from under it.

**When NOT to use it.** Skip it when you have no frozen, repeatable way to score the subject (no baseline means no comparison), for a quick one-off change you won't revisit (the checkpoint scaffolding is overhead), or when resumability buys you nothing because the work fits in one sitting.
