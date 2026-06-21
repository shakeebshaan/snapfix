---
name: repository-cleanup
title: Repository cleanup
category: Engineering
trigger: manual (periodic repo hygiene)
goal: verifiable — every remaining branch/PR/commit/worktree is intentional or safely removed with evidence
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/repository-cleanup-loop/
---

## What it does

Audits and organizes the state of a repository that's drifted into clutter. The agent inventories local and remote branches, open pull requests, commits, and worktrees; recovers any work that still has value; and clears out everything stale — until the repo is current and organized. The trigger is the moment abandoned branches, old worktrees, unclear PRs, or unmerged commits make it hard to tell which state still matters. It stops when every remaining item is intentional: each branch, PR, commit, and worktree is current, owned, or safely removed with evidence.

## Trigger

Manual. Run it from your repo against any CLI agent (bring-your-own):

```bash
claude -p "Inspect local and remote branches, pull requests, commits, and worktrees. Recover valuable work and clean everything stale until the repository is current and organized."
```

Or drive it through the snapfix runner as a one-shot tick, overriding the agent command for this loop:

```bash
node tools/loop.mjs run --agent 'claude -p "Inspect local and remote branches, pull requests, commits, and worktrees. Recover valuable work and clean everything stale until the repository is current and organized."'
```

Manual is right: cleanup is periodic hygiene you decide to do, not an automatic reaction to every push.

## Goal

**Verifiable.** "Done" means: zero unexplained repo state remains — every branch, PR, commit, and worktree is either current, owned (someone's actively on it), or safely removed *with evidence* it was merged or genuinely abandoned. The agent doesn't delete on a hunch; "safely removed with evidence" is the gate — it proves a branch's commits are reachable from main (or worthless) before pruning.

## Prompt

```text
Inspect local and remote branches, pull requests, commits, and worktrees. Recover valuable work and clean everything stale until the repository is current and organized.
```

## Notes / caveats

**Deletion is the irreversible part — demand evidence.** The whole loop hinges on "recover valuable work" coming *before* "clean everything stale." Make sure the agent proves a branch is merged or dead before it prunes; an over-eager run can delete the one unmerged fix nobody pushed. Review the recovery findings before you trust the deletions.

**Remote deletes are not local deletes.** Pruning a remote branch affects everyone. Scope the agent to local cleanup first, or have it propose remote deletions for your sign-off rather than executing them. Treat remote state as higher blast radius.

**Define "stale," or it guesses.** Give it a rule — "no commits in 90 days and no open PR" beats letting the model decide what counts as abandoned. Without a threshold it either spares everything or prunes work that's merely paused.

**When NOT to use it.** Skip it on a shared repo mid-release, or anywhere force-push and branch protection rules make automated cleanup risky. And never let it touch `main`/release branches — keep those out of scope explicitly.
