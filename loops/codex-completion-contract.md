---
name: codex-completion-contract
title: Codex completion contract
category: Evaluation
trigger: manual (long-running work where "partial" could be mistaken for "done")
goal: LLM-as-judge — every required outcome is marked proved against its evidence, or the loop stops as blocked/stalled/exhausted
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/codex-completion-contract-loop/
---

## What it does

A completion-contract loop for long-running work where stopping early looks deceptively like finishing — landing a PR and verifying it in production is the canonical example. Before acting, the agent writes down **every required outcome and the evidence that would prove it**. Then it works in bounded steps, and after each step marks each requirement **proved, weak, missing, or contradicted** against that evidence. The Goal completes *only* when all requirements are proved; otherwise it stops honestly as blocked, stalled, or exhausted. It asks before creating Goal state, and finishes with a requirement-to-evidence table, a status, an owner, and a next action.

## Trigger

Manual. Reach for it on multi-step work where "I did some of it" must never be reported as "done." Built around the `goal-planner-codex` workflow — any CLI agent that can run it works (bring-your-own):

```bash
claude -p "Run goal-planner-codex for this task: it's long-running Codex work where partial work could be mistaken for done. Landing a PR and verifying production is one example. Before acting, define every required outcome and its evidence. After each bounded action, mark requirements proved, weak, missing, or contradicted. Complete the Goal only when all are proved; otherwise stop as blocked, stalled, or exhausted. Ask before creating Goal state. Finish with the requirement-to-evidence table, status, owner, and next action."
```

No schedule/watch wiring — it's a deliberate, human-initiated contract on a specific task.

## Goal

**LLM-as-judge.** "Done" means: **every required outcome is marked proved** against the evidence defined for it before work began. The agent is the judge of each requirement's status, but the contract — the requirement list and what proves each — is fixed up front so the judgment is anchored. The stopping condition is all-proved, or an honest terminal state. Two sub-checks gate it:

- **Evidence is defined before acting** — you can't grade "done" against a contract written after the fact; the requirement-to-evidence table comes first.
- **Honest non-completion is a valid stop** — blocked / stalled / exhausted are first-class outcomes, not failures to paper over. A loop that can only ever return "done" can't be trusted.

## Prompt

```text
Run $goal-planner-codex [task] for long-running Codex work where partial work could be mistaken for done. Landing a PR and verifying production is one example. Before acting, define every required outcome and its evidence. After each bounded action, mark requirements proved, weak, missing, or contradicted. Complete the Goal only when all are proved; otherwise stop as blocked, stalled, or exhausted. Ask before creating Goal state. Finish with the requirement-to-evidence table, status, owner, and next action.
```

## Notes / caveats

**This is the antidote to false "done."** Its entire reason to exist is long-horizon tasks where an agent (or a human) calls it finished after the visible 80% — PR opened but never landed, fix shipped but never verified in prod. The requirement-to-evidence table makes the remaining 20% impossible to skip silently. Use it precisely when premature completion is the failure mode you fear.

**The contract is only as good as the requirements you list.** A vague or incomplete requirement set produces a loop that proves the wrong things thoroughly. Spend real effort defining every required outcome and its concrete evidence before the first action — that's where the leverage is.

**Built around goal-planner-codex.** The prompt invokes a specific Codex workflow (`$goal-planner-codex`) and asks before creating Goal state. If you're not running that harness, adapt the invocation to your agent — the discipline (define-evidence-first, mark-each-requirement, stop-honestly) carries over regardless.

**When NOT to use it.** Skip it for short, single-step work where "done" is self-evident (the contract overhead isn't worth it), and for tasks whose outcomes you can't express as checkable evidence. If you can't say what would *prove* completion, this loop has nothing to grade.
