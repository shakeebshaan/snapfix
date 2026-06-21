---
name: easy-onboarding
title: Easy onboarding
category: Design
trigger: manual (run when first-run friction is suspected)
goal: verifiable (reproducible) — a first-time user completes onboarding in one uninterrupted clean session
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/easy-onboarding-loop/
---

## What it does

Plays a first-time user of your product: starts at the real entry point in a clean browser session — no saved login, site data, remembered route, or hidden setup — and completes onboarding using only the guidance actually visible on screen, recording every obstacle. It fixes the single worst obstacle with the smallest change that preserves every security, access, and product requirement, then discards the session and retries from scratch. It repeats until one uninterrupted clean session gets a newcomer all the way through, or until there's no safe fix left, access is blocked, or approval is required. The clean session is the whole point: remembered account data and cookies let experienced users glide past unclear instructions, hidden assumptions, and dead-end recovery paths that a real first-timer slams into.

## Trigger

Manual. You read the obstacle list and the diffs, so be present for the run.

```bash
claude -p "Act like a first-time user of [product]. Start at the real entry point in a clean session with no saved login, site data, remembered route, or hidden setup. Complete onboarding using only visible guidance and record obstacles. Fix the worst one with the smallest change that preserves every security, access, and product requirement. Discard the session and retry. Stop after one uninterrupted success, no safe fix, blocked access, or required approval. Return the path, changes, evidence, and blockers."
```

Needs a browser-capable agent. Point `qa.config.json → loop.schedule.agentCmd` at this prompt to drive it through the snapfix runner.

## Goal

**Verifiable (reproducible).** "Done" means: a first-time user reaches the end of onboarding in *one* uninterrupted, clean-state session using only visible guidance — no saved state, no operator nudge, no hidden setup. The verifiable floor is exactly that: *a new user reaches value with no hidden steps.* Two sub-checks gate it:

- **Every attempt starts from a discarded session** — fresh login, cookies, and route each time, or a returning-user shortcut masks the newcomer friction.
- **Each fix preserves all security, access, and product requirements** — "smoother onboarding" never means a weakened auth gate or a skipped required step.

It also stops honestly on no-safe-fix, blocked access, or required approval — non-passes that hand you the blocker list.

## Prompt

```text
Act like a first-time user of [product]. Start at the real entry point in a clean session with no saved login, site data, remembered route, or hidden setup. Complete onboarding using only visible guidance and record obstacles. Fix the worst one with the smallest change that preserves every security, access, and product requirement. Discard the session and retry. Stop after one uninterrupted success, no safe fix, blocked access, or required approval. Return the path, changes, evidence, and blockers.
```

## Notes / caveats

**The clean session is the contract — fake it and the result is worthless.** A fresh incognito context or a wiped profile per attempt. If saved login or a remembered route leaks across retries, the loop measures a returning user and signs off on onboarding it never actually tested.

**It edits the live first-run flow, so review every diff.** "Smallest change that preserves security/access" is a real guardrail, but it's the agent's judgment — read what it touched. A fix that removes a step to reduce friction can quietly drop a required gate; that's a regression, not a win.

**Token cost scales with how rough onboarding is.** Each obstacle is a full complete-fix-discard-retry cycle, and each retry is a fresh browser pass. A flow with many hidden assumptions is many restarts — cap it so a deeply broken first-run escalates its blocker list instead of looping.

**When NOT to use it.** Skip onboarding you can't complete headlessly — real payment, an SMS/2FA code, manual identity verification. The agent stalls at the human-gated step and reports a blocker; useful, but cheaper to know before you spend the run.
