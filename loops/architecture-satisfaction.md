---
name: architecture-satisfaction
title: Architecture satisfaction loop
category: Engineering
trigger: manual or schedule (nightly)
goal: LLM-as-judge — happy with the architecture
source: Loop Library video (verbatim prompt)
---

> **Refactor until the architecture is good, then stop.** Trigger it by hand or let it
> run nightly; the agent keeps simplifying and DRY-ing the codebase until *it* judges the
> architecture worth keeping — testing, auto-reviewing, and committing as it goes.

## What it does

Points an agent at your codebase and asks it to refactor toward a clean architecture —
strict simplicity, no repetition — instead of toward a number. It works in small,
verifiable steps: after each meaningful change it live-tests the system, runs an
auto-review, and commits, so the history stays bisectable and nothing rots silently. A
progress markdown file is the agent's memory between steps, which keeps a long run coherent
even across context resets. It ends when the model is satisfied — a classic LLM-as-judge
loop, not a deterministic one.

## Trigger

Manual is the honest default: you read the resulting diffs, so you want to be around.

```bash
# Manual, in your app repo:
claude -p "$(cat loops/architecture-satisfaction.md | sed -n '/^```text$/,/^```$/p')"
# …or just paste the Prompt block below into Claude Code / Codex.
```

To run it nightly through snapfix's runner, set the schedule trigger and point `agentCmd`
at this loop, then install the OS-scheduler line:

```jsonc
// qa.config.json → loop.schedule
"schedule": {
  "cron": "0 2 * * *",                                  // 02:00, low-traffic hours
  "agentCmd": "claude -p \"/architecture-satisfaction\""
}
```

```bash
node tools/loop.mjs schedule --cron "0 2 * * *"   # prints the cron / Task Scheduler line
```

## Goal

**LLM-as-judge.** "Done" is when the agent declares it is *happy with the architecture* —
simplicity is strict, every line is DRY, and it can't justify another refactor. There is
no test threshold or coverage number gating the stop; the live tests and auto-review are
the *floor* that keeps each step honest, not the *stopping condition*. Because taste is
delegated to the model, set a budget (see Notes) — the judge can keep finding "one more"
cleanup. The progress file is the running record of what "satisfied" looked like at each
step.

## Prompt

```text
Refactor until you are happy with the architecture. Be strict about simplicity / make sure every line is DRY. After each significant step, live test the system, run auto-review, and commit. Track progress in a markdown file.
```

Peter Steinberger uses this one often. It is deceptively complete: a single sentence
carries the trigger ("refactor"), the judge goal ("until you are happy with the
architecture"), the taste bar ("strict about simplicity / every line DRY"), the
per-step safety rhythm (live test → auto-review → commit), and the durable memory hook
(a markdown progress file). The progress file is the trick that makes a long judge loop
survive — the agent writes down what it changed and why, so the *next* step reasons from
a record instead of from a faded context window.

## Notes / caveats

- **Token cost is real.** A judge loop on architecture has no natural floor — it runs
  until the model feels finished, which can be many steps over a long session. Cap it:
  give it a step budget ("stop after N significant steps and summarize"), a time box, or
  run it nightly so each pass is bounded by the schedule.
- **"DRY every line" is a sharp knife.** Taken literally it can over-abstract — premature
  shared helpers, indirection that hurts readability. The auto-review step is your guard;
  keep the reviewer strict and read the diffs. Soften the wording if your codebase favors
  locality over deduplication.
- **Manual-first for high blast radius.** Architecture refactors cross module boundaries.
  Run it manually (or on a branch) the first few times before trusting a nightly schedule,
  and make sure "live test the system" maps to a real, green test command for your project.
- **When not to use it:** open-ended feature work (the agent wanders without a convergent
  target), or a codebase with thin/flaky tests — the per-step verification is what makes
  the judge's "happy" trustworthy, and without it you're committing taste with no floor.
