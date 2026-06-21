---
name: overnight-docs-sweep
title: Overnight docs sweep
category: Operations
trigger: schedule (nightly — runs after the day's commits have landed)
goal: LLM-as-judge — documentation completely reflects the latest changes
source: Loop Library video (verbatim prompt)
---

## What it does

Every night, an agent reads the whole codebase, diffs it against what the docs
currently claim, and brings the documentation back in sync with the day's
changes. It then opens a pull request with exactly those doc edits — nothing
else — so you wake up to a reviewable diff instead of stale docs. It's the
unglamorous chore that never gets done, handed to a loop that runs while you
sleep.

## Trigger

Scheduled, nightly. Point snapfix's runner at your agent command and let the OS
scheduler fire it once a day, after the day's commits have landed:

```bash
# Print the scheduler line to install (cron on POSIX, Task Scheduler on Windows)
node tools/loop.mjs schedule --cron "0 2 * * *"

# Each tick just invokes your configured agentCmd once — set it to this sweep:
#   qa.config.json → loop.schedule.agentCmd:
#     "claude -p \"/overnight-docs-sweep\""
node tools/loop.mjs run
```

Or schedule the agent directly with Claude Code / Codex, no runner in the loop:

```bash
# Claude Code routine (runs nightly at 02:00)
claude schedule add --cron "0 2 * * *" -p "$(cat loops/overnight-docs-sweep.md)"

# Codex CLI, fired from your own cron entry
codex exec --cd . "$(sed -n '/^## Prompt/,/^## Notes/p' loops/overnight-docs-sweep.md)"
```

2 a.m. is a good default: after the day's work, before you're back at the
keyboard.

## Goal

**LLM-as-judge — the documentation is complete.** "Done" is when the agent
judges that every doc reflects the previous day's changes: no stale function
signatures, no renamed-but-still-documented modules, no shipped features the
README never mentions. Completeness here is non-deterministic — there is no test
that returns green for "the docs are accurate" — so the model is the judge of
when the sweep is finished.

The stopping condition is concrete even though the goal is judged: the agent
loops over each doc until it can find nothing in the codebase the docs
contradict or omit, then **opens one pull request** with the changes. If the
docs already match the code, the correct outcome is *no PR* — the loop should
not invent edits to look busy.

## Prompt

```text
Each night, review the codebase in full and make sure all documentation reflects the latest changes from the previous day. Update the documentation as needed, then open a pull request with those changes.
```

## Notes / caveats

- **Token cost is real.** "Review the codebase in full" on a large repo is a
  big read every night. Scope it down if the bill bites — diff against
  yesterday's commits (`git log --since=midnight`) and only re-read the touched
  areas plus the docs that reference them. The verbatim prompt above is the
  full-sweep version; a diff-scoped variant is cheaper and usually enough.
- **It's a judge loop, so taste is delegated.** With no test to fail, the agent
  decides what "complete" means. Review the PR like any other — it can be
  over-eager (rewriting prose that was fine) or miss a subtle behavior change.
  Keep the PR small and doc-only so the diff is easy to read.
- **When not to use it:** mid-feature branches where the docs *should* lag the
  code, or repos with generated docs (API references built from source) — let
  the generator own those and don't have a nightly agent fight it.
- **One PR per night, not per file.** Batched into a single reviewable diff,
  the sweep is a five-minute morning skim. Fan it out into many PRs and it
  becomes noise you'll start ignoring — which defeats the loop.
