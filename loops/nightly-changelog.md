---
name: nightly-changelog
title: Nightly changelog
category: Operations
trigger: schedule (nightly — runs after the day's changes have landed)
goal: verifiable — every user-relevant change from the day is logged, or a no-change result is recorded
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/nightly-changelog-sweep/
---

## What it does

Once a night, an agent reviews the previous day's changes — PRs, commits,
deployments — and updates the changelog with anything a user should know about. It
sorts the user-facing changes from the internal churn, adds dated entries without
duplicating ones already logged, and validates the update. If nothing user-relevant
shipped that day, it records the no-change result rather than inventing an entry. The
unglamorous "did we update the changelog?" chore, handed to a loop that runs while you
sleep.

## Trigger

Scheduled, nightly. Point snapfix's runner at your agent command and let the OS
scheduler fire it once a day, after the day's work has landed:

```bash
# Print the scheduler line to install (cron on POSIX, Task Scheduler on Windows)
node tools/loop.mjs schedule --cron "0 2 * * *"

# Each tick just invokes your configured agentCmd once — set it to this sweep:
#   qa.config.json → loop.schedule.agentCmd:
#     "claude -p \"/nightly-changelog\""
node tools/loop.mjs run
```

2 a.m. is a sensible default: after the day's commits, before you're back at the
keyboard.

## Goal

**Verifiable (review).** "Done" means every user-relevant change from the previous
day is accounted for and the changelog is updated and validated — or, if nothing
user-facing shipped, the no-change result is explicitly recorded. The stopping
condition is an accounted-for changeset, not "the model felt finished." Two sub-checks
gate it:

- **No duplicate entries.** The agent checks what's already logged before appending —
  a re-run on the same day must be a no-op, not a second copy of yesterday's notes.
- **No-change is a valid terminal state.** A quiet day ends with a recorded "no
  user-facing changes," never a manufactured entry to look busy.

## Prompt

```text
Each night, review changes from the previous day and update the changelog with anything users should know.
```

## Notes / caveats

**Define "user-relevant," or it logs noise.** Left to guess, the agent may dump
refactors, test changes, and dependency bumps into a changelog meant for humans who
use the product. Give it the filter: user-visible behavior, new features, fixes they'd
notice — not internal plumbing.

**It reads the diff, so feed it a clean one.** The loop keys off the previous day's
PRs and commits. Squash-merged, well-titled PRs give it good source material; a day of
"wip" commits gives it mush. The changelog quality tracks your commit hygiene.

**Pairs with the overnight docs sweep.** Both run nightly off the day's changes — that
one keeps the docs honest, this one keeps the changelog honest. Stagger their cron
times so they're not both doing a full read at 2 a.m. on the same box.

**When NOT to use it.** Skip it on repos with a generated or release-tag-driven
changelog — don't have a nightly agent fight your release tooling. And if your team
already writes changelog entries in the PR itself, this is redundant churn.
