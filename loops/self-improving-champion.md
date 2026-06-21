---
name: self-improving-champion
title: Self-improving champion
category: Evaluation
trigger: manual (you decide when to spend an optimization run)
goal: verifiable — a challenger beats the saved champion on untouched holdouts by the set margin without weakening a must-pass check
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/self-improving-champion-loop/
---

## What it does

A prompt-optimization loop that iteratively improves a prompt, policy, or configuration (a support assistant's system prompt is the canonical example). It keeps a **champion** — the current best version with a recorded score — and tries **challengers** against it. Each round changes exactly *one* thing, driven by a recorded failure, and is iterated on a **working set**. A challenger is only promoted if it beats the champion on **fresh, untouched holdout cases** by a set margin *and* doesn't weaken any must-pass check. The training/holdout split is what keeps it from overfitting; the must-pass guard is what keeps it from regressing. It stops at the target, the budget, or no progress.

## Trigger

Manual. Reach for it when you want to systematically tune a prompt or config rather than hand-edit it. Any CLI agent works — bring-your-own:

```bash
claude -p "Improve a prompt, policy, or configuration. A support assistant's system prompt is one example. Save the champion, its score, a working set, untouched holdout cases, must-pass checks, and a budget. Each round, change one thing based on a recorded failure. Promote the challenger only if it beats the champion on holdouts by a set margin without weakening a must-pass check; otherwise keep the champion. Stop at the target, budget limit, or no progress. Return the winner, scores, experiment log, and remaining failures."
```

No schedule/watch wiring — optimization is expensive and human-gated by design.

## Goal

**Verifiable.** "Done" means: the loop returns the best version it found, where every promotion was earned by a challenger **beating the champion on held-out cases by the set margin** with no must-pass check weakened. The stopping condition is target reached, budget exhausted, or no progress — explicit, not vibes. Two sub-checks gate every promotion:

- **Holdouts stay untouched** — challengers iterate on the working set; promotion is decided only on fresh cases the optimization never saw, or the score is just memorization.
- **One change per round, from a recorded failure** — so wins are attributable and the experiment log is meaningful.

## Prompt

```text
Improve a prompt, policy, or configuration. A support assistant's system prompt is one example. Save the champion, its score, a working set, untouched holdout cases, must-pass checks, and [budget]. Each round, change one thing based on a recorded failure. Promote the challenger only if it beats the champion on holdouts by [margin] without weakening a must-pass check; otherwise keep the champion. Stop at the target, budget limit, or no progress. Return the winner, scores, experiment log, and remaining failures.
```

## Notes / caveats

**The train/holdout split is load-bearing — don't leak.** The single biggest failure mode is letting holdout cases bleed into the working set: the score climbs, the real-world result doesn't. Lock the holdouts before round one and never iterate against them. If you can't keep them separate, this loop will lie to you.

**Set the margin and budget up front.** A too-small margin promotes noise as progress; no budget means it grinds forever on diminishing returns. Both belong in the prompt before you run, alongside the must-pass checks that act as a regression floor.

**Token cost scales with rounds, not scenarios.** Each round is a full evaluation of a challenger against working + holdout sets. Many small rounds add up fast — cap the budget and let "no progress" terminate it early rather than spending to a hard ceiling.

**When NOT to use it.** Skip it if you have no way to *score* the subject objectively (no rubric, no metric — the comparison is meaningless), if you can't build a real holdout set, or for a one-line prompt tweak you could just ship. This is for tuning that warrants an experiment log, not casual edits.
