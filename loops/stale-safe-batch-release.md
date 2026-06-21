---
name: stale-safe-batch-release
title: Stale-safe batch release
category: Engineering
trigger: manual (run when several changes are ready at once)
goal: verifiable — only current, complete changes ship in a combined, deploy-verified release
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/stale-safe-batch-release-loop/
---

## What it does

Coordinates a release when several branches or PRs come ready at the same time. The agent reviews all pending changes, excludes anything stale or unfinished, combines the valid changes onto the latest main, and releases them together as one verified artifact. The promise baked into the goal: only current, complete changes ship in the combined release. It stops when the batch is built, verified, and the production deploy is confirmed.

## Trigger

Manual. Run it from your repo against any CLI agent (bring-your-own):

```bash
claude -p "Review pending changes and pull requests, exclude stale or unfinished work, combine the valid changes, and release them together."
```

Or drive it through the snapfix runner as a one-shot tick, overriding the agent command for this loop:

```bash
node tools/loop.mjs run --agent 'claude -p "Review pending changes and pull requests, exclude stale or unfinished work, combine the valid changes, and release them together."'
```

Manual is right: a batch release is a deliberate cut you make when work has piled up ready, not a per-commit reflex.

## Goal

**Verifiable.** "Done" means: the valid changes are combined off the latest main, the batch passes its checks, and the production deploy is confirmed. The gating invariant is *only current, complete changes ship* — stale or half-finished work is excluded, not silently carried along. A batch that deployed but quietly included an unfinished branch fails the goal.

## Prompt

```text
Review pending changes and pull requests, exclude stale or unfinished work, combine the valid changes, and release them together.
```

## Notes / caveats

**Deploy is irreversible — this is the highest-blast-radius loop in the set.** It ships to production. Keep a human on the cut: have the agent assemble and verify the batch and propose the deploy, but gate the actual production push on your confirmation unless your pipeline has bulletproof rollback. R10 territory — executed evidence only.

**"Stale or unfinished" needs a definition.** Tell it what excludes a change: failing checks, an open "WIP" label, no review approval, conflicts with main. Without explicit criteria the agent guesses what's "complete" and may either drop good work or carry in a half-baked branch.

**Combine-order matters — rebase onto latest main first.** Merging several branches together surfaces conflicts the individual PRs never saw. The "latest main" framing is load-bearing: a batch built off a stale base ships an old foundation. Verify the combined result, not just each branch in isolation.

**When NOT to use it.** Skip it for a single change (just ship it), and skip it if your release process needs product/coordination judgment the agent can't make. Pairs naturally after the **repository cleanup** loop — clean state first, then batch what's genuinely ready.
