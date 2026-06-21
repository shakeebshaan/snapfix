---
name: ticket-to-pr-ready
title: Ticket-to-PR-ready
category: Engineering
trigger: action (a new ticket/bug report/complaint lands)
goal: verifiable — issue reproduces before the fix, no longer reproduces after, regression checks pass
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/ticket-to-pr-ready-loop/
---

## What it does

Turns a loosely-written ticket, bug report, failing behavior, or customer complaint into a review-ready patch. The agent reproduces the failure in the smallest representative environment, proves the root cause, makes the smallest credible fix, and reruns the original reproduction plus relevant regression tests. If it can't reproduce the issue after two serious attempts, it says so rather than fixing blind. It refuses to fold unrelated refactors into the patch, and finishes with a structured handoff: cause, changed files, before-and-after proof, risks, and a PR summary.

## Trigger

Action-triggered. Point the runner at your issue queue and let it kick the agent when a ticket arrives:

```bash
node tools/loop.mjs watch --interval 60
```

The runner polls for new work and shells out to your configured `agentCmd`. Each ticket becomes one bounded run; a human still reviews the resulting PR.

## Goal

**Verifiable (review).** "Done" means: the issue *reproduced* before the fix, *no longer reproduces* after, and relevant regression checks pass — delivered as a review-ready patch. Two hard gates: reproduction-first (no fix lands without a failing repro proving the bug was real) and a clean before/after diff in that same repro. If two serious reproduction attempts fail, the terminal state is an honest "can't reproduce," not a speculative change.

## Prompt

```text
Take a ticket, bug report, failing behavior, or customer complaint and turn it into a review-ready patch. Reproduce the failure in the smallest representative environment, prove the root cause, make the smallest credible fix, and rerun the original reproduction plus relevant regression tests. If the issue cannot be reproduced after two serious attempts, say so. Do not fold unrelated refactors into the patch. Finish with the cause, changed files, before-and-after proof, risks, and pull-request summary.
```

## Notes / caveats

**Reproduction-first is the whole discipline — don't dilute it.** The loop's value is that it never ships a fix for a bug it couldn't reproduce. If you weaken that (let it "fix" plausible-looking code without a failing repro), you get confident patches for the wrong cause. The two-attempts-then-say-so rule is a feature; keep it.

**Smallest-credible-fix keeps blast radius low.** The explicit "do not fold unrelated refactors" clause is what makes the output reviewable. Watch for scope creep in the diff — if the agent rewrites a module to fix a one-liner, send it back.

**It produces a PR, not a merge.** Landing stays human. The structured handoff (cause, files, before/after, risks) exists so a reviewer can decide fast — read it, don't rubber-stamp.

**When NOT to use it.** Skip it for issues that need product judgment rather than a code fix, for vague tickets with no observable failing behavior to reproduce, and where the agent has no sandbox it can actually run the repro against.
