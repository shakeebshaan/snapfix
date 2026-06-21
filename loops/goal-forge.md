---
name: goal-forge
title: Goal forge
category: Design
trigger: manual (run before a long autonomous task, not during one)
goal: verifiable (review) — two complete planning files exist and every key decision is settled, or the loop stops as "not ready"
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/goal-forge-loop/
---

## What it does

Turns a rough coding idea into two planning files *before* an agent starts a long autonomous run. It interviews you, then writes `SPEC.md` — what to build, what to exclude, what to consider, and measurable `done_when` completion checks — and `GOAL.md` — the work plan, a progress scorecard, quick and final checks, memory files, evidence, and explicit approval boundaries. The point is to settle scope, completion criteria, safety limits, and tool availability with a human in the loop *now*, so the long run later doesn't make silent product decisions on its own. If any load-bearing decision, permission, tool, environment requirement, or test is still missing, it stops and declares itself **not ready** rather than guessing. It never starts implementation.

## Trigger

Manual, and deliberately so — the interview *is* the loop. You answer questions; the agent drafts the spec.

```bash
claude -p "Turn [rough coding idea] into two planning files before Codex starts /goal, its long-running task mode. Interview the user, then write SPEC.md: what to build, exclude, and consider, plus measurable done_when completion checks. Write GOAL.md: the work plan, progress scorecard, quick and final checks, memory files, evidence, and approval boundaries. If any key decision, permission, tool, environment requirement, or test is missing, stop as not ready. Do not start implementation without approval."
```

This is the planning front-end to an execution loop — feed the resulting `GOAL.md` to your long-running agent afterward.

## Goal

**Verifiable (review).** "Done" means: both `SPEC.md` and `GOAL.md` exist, complete, with measurable `done_when` checks and explicit approval boundaries — *or* the loop has stopped and named itself **not ready** with the specific missing decision/permission/tool/test. There is no implementation and no merge; the deliverable is the plan a human signs off on. Two sub-checks gate it:

- **`done_when` is measurable** — a runnable check or observable evidence, not a vibe. A spec whose completion can't be tested isn't done.
- **A missing key decision forces a hard stop** — the loop must surface "not ready" rather than paper over a gap, because every gap left here becomes a silent product choice in the long run later.

## Prompt

```text
Turn [rough coding idea] into two planning files before Codex starts /goal, its long-running task mode. Interview the user, then write SPEC.md: what to build, exclude, and consider, plus measurable done_when completion checks. Write GOAL.md: the work plan, progress scorecard, quick and final checks, memory files, evidence, and approval boundaries. If any key decision, permission, tool, environment requirement, or test is missing, stop as not ready. Do not start implementation without approval.
```

## Notes / caveats

**It is written for Codex `/goal`, but the artifacts are portable.** The prompt names Codex's long-running task mode; the `SPEC.md` / `GOAL.md` pair works for any autonomous agent. Keep the file names — downstream loops and the snapfix runner key off them as durable memory.

**The interview is where the value is — answer honestly.** Garbage answers produce a confident spec that's wrong, which is worse than a thin one. If you don't know a decision yet, say so; the loop is *supposed* to stop as not-ready rather than invent it for you.

**"Not ready" is a success state, not a failure.** The whole job is catching missing permissions, tools, or untestable goals before they cost a long unattended run. Reward the stop; don't pressure it past the gate.

**When NOT to use it.** Skip it for small, reversible, well-understood changes — the planning overhead dwarfs the task. It earns its keep only ahead of a genuinely long, autonomous, hard-to-supervise run where a silent product decision would be expensive to unwind.
