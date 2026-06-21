---
name: clodex-adversarial-review
title: Clodex adversarial review
category: Engineering
trigger: manual (run /clodex on a task)
goal: verifiable — Codex approves the PR (or only accepted findings remain) within the iteration cap
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/clodex-adversarial-review-loop/
---

## What it does

A two-model adversarial review loop. Claude plans a task, implements it, and opens a pull request; Codex then reviews it independently and adversarially — trying to break it. Claude fixes every finding above the configured severity threshold and the cycle repeats. It runs until Codex approves, only accepted findings remain, progress stalls, or the iteration cap is reached. Branch, PR, findings, verdict, and iteration state stay resumable across runs. Critically, it never describes an errored or exhausted run as approved — it finishes with the PR, checks, verdict, and any remaining findings, honestly labeled.

## Trigger

Manual, via the `/clodex` command on a specific task. Run it against your agent (bring-your-own):

```bash
claude -p "Run /clodex [task] think hard --max-iter 5 --threshold medium."
```

Or drive it through the snapfix runner as a one-shot tick (the loop is resumable, so successive ticks continue the same review), overriding the agent command for this loop:

```bash
node tools/loop.mjs run --agent 'claude -p "Run /clodex [task] think hard --max-iter 5 --threshold medium — plan, implement, open a PR, get an adversarial Codex review, fix findings above the threshold, and repeat until approved; never report an errored or exhausted run as approved."'
```

Manual is right: you point it at a defined task; it isn't a background watcher.

## Goal

**Verifiable (adversarial).** "Done" means: Codex — a second, independent model — approves the PR, or only findings you've explicitly accepted remain. The gate is an external adversary's verdict, not Claude's own satisfaction. Two honesty rules bound it: an errored, stalled, or iteration-capped run is *never* reported as approved, and the loop terminates at `--max-iter` rather than grinding forever. `--threshold` sets which severities must be fixed before approval counts.

## Prompt

```text
Run /clodex [task] think hard --max-iter 5 --threshold medium. Claude plans the task, implements it, opens a pull request, asks Codex for an adversarial review, fixes findings above the accepted severity, and repeats. Keep the branch, PR, findings, verdict, and iteration state resumable. Stop when Codex approves, only accepted findings remain, progress stalls, or the iteration cap is reached. Never describe an errored or exhausted run as approved. Finish with the PR, checks, verdict, and remaining findings.
```

## Notes / caveats

**Needs two agents wired up.** This loop assumes both Claude and a working Codex CLI are installed and authenticated. The whole point is that the reviewer is a *different* model than the author — a self-review by one model doesn't get you the adversarial pressure. Confirm `codex` runs before relying on it.

**The iteration cap is a budget, not a target.** Two models round-tripping a PR — implement, review, fix, re-review — is the most token-hungry loop in this set. `--max-iter 5` bounds it; lower it for cheap tasks. A run that hits the cap is a *result* (unresolved), not a failure to hide — read the remaining findings.

**Tune `--threshold` to the work.** `medium` fixes medium-and-above and lets nits ride; raise it for prototypes, lower it for security-sensitive paths. Mismatched threshold is why the loop either churns on cosmetics or approves something it shouldn't.

**When NOT to use it.** Skip it for trivial changes where one review is plenty, and don't trust an "approved" verdict from an errored Codex run — the prompt forbids it for a reason, so check the verdict label, not just that the loop exited.
