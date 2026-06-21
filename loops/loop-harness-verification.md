---
name: loop-harness-verification
title: Loop-harness verification
category: Evaluation
trigger: schedule (recurring repo work, runs unattended)
goal: LLM-as-judge — a second independent agent approves the staged output against explicit criteria before it ships
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/loop-harness-verification-loop/ (prompt adapted from the loop's published objective)
---

## What it does

A scheduled, two-agent workflow for recurring repository chores — CI triage, issue grooming, dependency bumps, docs sync — with independent verification baked in. One agent session does the work and **stages** its output in an isolated git worktree (a patch, or an outbox message); it never ships directly. A **second, separate** agent session then reviews that staged output against explicit pass/fail criteria. Output ships only on a pass. On a fail, the evidence is preserved and the loop retries — up to a preset limit — making no external change in between. It finishes by reporting the result, the verifier's verdict, and whether anything was delivered.

## Trigger

Scheduled. Wire the cadence once, then point your agent invocation at this loop:

```bash
# print the OS-scheduler line to install (cron on POSIX, Task Scheduler on Windows)
node tools/loop.mjs schedule --cron "0 6 * * *"
```

Set `qa.config.json → loop.schedule.agentCmd` to this loop's invocation (it's bring-your-own-agent; the runner only orchestrates). Dry-run a single tick with `node tools/loop.mjs run` before you trust the schedule.

## Goal

**LLM-as-judge.** "Done" means: a *second, independent* agent session has reviewed the staged output against explicit criteria and **approved** it — only then does it ship. The stopping condition is verifier approval, not the worker declaring itself finished. Two sub-checks gate it:

- **The worker and the verifier are separate sessions** — the maker never grades its own homework; staging lives in an isolated worktree so a failed check leaves no external trace.
- **Retries are bounded** — a fail preserves findings and retries only up to the preset limit, then escalates rather than looping forever.

## Prompt

```text
Use this loop for scheduled repository work such as CI triage, issue grooming, dependency updates, or docs sync. Set a retry limit, then start an isolated git worktree. Let one agent session stage a patch or outbox message, and a second, independent agent session verify it against explicit, written criteria. Ship only after a pass; otherwise preserve the findings, make no external change, and retry only within the limit. Finish by returning the results, the verifier's status, and the delivery outcome.
```

## Notes / caveats

**Prompt is adapted, not verbatim.** The source page describes the workflow structure rather than giving a copy-paste block; the prompt above is derived faithfully from its published objective. Tune the criteria and retry limit to your repo before running.

**Two sessions means roughly double the token cost per tick.** You're paying for a maker *and* an independent judge on every run. That's the price of catching the maker's blind spots — but it makes this one of the pricier scheduled loops. Cap the retry limit so a stubborn task can't burn the budget overnight.

**Write the verifier's criteria down explicitly.** A vague "looks good" verifier rubber-stamps everything and defeats the purpose. Give it concrete pass/fail conditions tied to the chore — tests green, no unrelated diffs, the outbox message matches the issue. Garbage criteria, garbage gate.

**When NOT to use it.** Skip it for one-off work (no schedule to justify), for chores where a deterministic check already suffices (use a plain `verify` gate — cheaper than a second LLM), or when you can't safely isolate staging in a worktree. Keep a human on the landing gate for anything irreversible.
