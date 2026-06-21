---
name: housekeeper
title: Housekeeper
category: Engineering
trigger: manual (deliberate, bounded cleanup pass)
goal: verifiable — no confirmed low-risk cleanup remains and the suite still passes
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/housekeeper-loop/
---

## What it does

Conservative repo tidying, one low-risk change at a time. The agent hunts dead code,
stale files and comments, unused dependencies, duplication, broken links, inconsistent
names, and confusing structure — then proves a single cleanup, makes the smallest
coherent change, and reruns the build, tests, runtime checks, and a diff review before
keeping it. Anything unrelated, active, uncommitted, generated, or merely uncertain is
protected, not touched. It keeps only verified improvements and reports the rest as
deferred candidates rather than guessing.

## Trigger

Manual. A housekeeping sweep is a deliberate, bounded pass you run when cruft has
piled up — not on every push. Kick it off with any CLI agent:

```text
claude -p "/housekeeper"
```

Or drive it through the snapfix runner as a one-shot tick, overriding the agent
command for this loop:

```text
node tools/loop.mjs run --agent 'claude -p "Review [repository or code project] for dead code, stale files or comments, unused dependencies, duplication, broken links, inconsistent names, and confusing structure. Protect unrelated, active, uncommitted, generated, and uncertain work. Prove one low-risk cleanup, make the smallest coherent change, then rerun build, tests, runtime checks, and diff review. Keep only verified improvements; stop when none remain, progress stalls, verification is unavailable, or approval is required."'
```

## Goal

**Verifiable.** "Done" means: no confirmed low-risk cleanup remains and existing
behavior still passes — every kept change has the build, tests, and runtime checks
green behind it. The loop also stops if progress stalls, verification is unavailable,
or approval is required. Each accepted change is gated by a re-run of the full
verification (build + tests + runtime + diff review); an unverified cleanup is
reverted, not kept.

## Prompt

```text
Review [repository or code project] for dead code, meaning unreachable or unused code; stale files or comments; unused dependencies; duplication; broken links; inconsistent names; and confusing structure. Protect unrelated, active, uncommitted, generated, and uncertain work. Prove one low-risk cleanup, make the smallest coherent change, then rerun the build, tests, runtime checks, and diff review. Keep only verified improvements. Stop when none remain, progress stalls, verification is unavailable, or approval is required. Return changes, evidence, and deferred candidates.
```

## Notes / caveats

**Needs a real verification gate.** The whole loop bottoms out on "rerun the build,
tests, runtime checks, and diff review." If your project can't run those deterministically,
the agent has nothing to prove a cleanup against and will (correctly) stop. Wire up
`node tools/loop.mjs verify` or your test command first.

**One change at a time, by design.** Resist the urge to let it batch deletions —
smallest coherent change + re-verify is what keeps it low-risk and bisectable. If it
starts proposing sweeping refactors, that's out of scope; rein the prompt back to tidy-ups.

**Never delete on a hunch.** The agent is told to protect anything whose purpose isn't
obvious. Don't override that in review: an unobvious symbol is a "deferred candidate" to
investigate, not a kill. Most false-positive removals come from skipping this rule.

**When NOT to use it.** Skip on a red suite (fix failing tests first), on throwaway
prototypes, and on anything mid-flight with uncommitted edits you care about — commit or
stash first so the protect-uncommitted rule has a clean baseline.
