---
name: ui-ux-score
title: UI/UX score
category: Design
trigger: manual (run on a browsable flow you can fully exercise)
goal: both (visual + interaction) — the user flow hits its completion criterion with regression-free, score-improving changes
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/ui-ux-score-loop/
---

## What it does

Drives a real browser through an actual user task — signup, login, onboarding, checkout — and scores each meaningful screen against one consistent checklist. It finds the weakest *safe* area, improves it, then reruns the whole flow to confirm the change didn't regress another screen, keeping only regression-free edits. Every pass starts from fresh browser state — no saved login, cookies, or site data — because remembered sessions hide exactly the friction a first-timer hits. Reusing the same task and the same rubric on every pass is what makes the scores comparable run to run, so "better" means something measurable instead of a fresh opinion each time.

## Trigger

Manual. You want eyes on the screenshots and the score deltas as it iterates.

```bash
claude -p "Improve [user flow, such as signup] at [URL] until [completion criterion]. In a real browser, start each pass from fresh state—no saved login, cookies, or site data. Capture meaningful screens at the agreed sizes and modes, score them with one checklist, and improve the weakest safe area. Rerun the whole flow and keep only regression-free changes. Stop on success, two full passes with no gain, blocked access, or required approval. Return scores, screenshots, changes, and stop reason."
```

Needs a browser-capable agent (a headless-browser tool / MCP). Point `qa.config.json → loop.schedule.agentCmd` at it to run via the snapfix runner.

## Goal

**Both (visual + interaction).** "Done" means: the flow reaches its `[completion criterion]` with the rubric scores improved and no screen regressed — a *verifiable* gate (task completes, prior screens still pass) wrapped around an *LLM-judge* score (the checklist read of each screen). It also stops on two full passes with no gain, blocked access, or a required approval. Two sub-checks gate it:

- **Only regression-free changes survive** — the full-flow rerun is mandatory; an edit that lifts one screen and breaks another is discarded.
- **Every pass scores from fresh browser state** — saved login/cookies/site data are cleared first, or the scores measure a returning user, not the onboarding you're trying to fix.

## Prompt

```text
Improve [user flow, such as signup] at [URL] until [completion criterion]. In a real browser, start each pass from fresh state—no saved login, cookies, or site data. Capture meaningful screens at the agreed sizes and modes, score them with one checklist, and improve the weakest safe area. Rerun the whole flow and keep only regression-free changes. Stop on success, two full passes with no gain, blocked access, or required approval. Return scores, screenshots, changes, and stop reason.
```

## Notes / caveats

**The score is an LLM judge, so it's brittle — pin the rubric.** A checklist the model re-interprets each pass produces noisy, non-comparable numbers and "improvements" that just chase the prompt. Fix the rubric text, the screen sizes, and the modes up front and keep them identical across passes; the comparability is the whole point.

**It edits live UI, so review the diffs.** "Improve the weakest safe area" touches real source. The regression rerun is your floor, but a green flow still doesn't mean the change was *tasteful* — read what it changed before shipping.

**Token cost is real: a browser pass per iteration.** Capturing, scoring, editing, and re-running the full flow is expensive, and "two passes with no gain" can still mean several. Scope `[user flow]` tight and set a hard `[completion criterion]` so it converges instead of polishing forever.

**When NOT to use it.** Skip flows you can't fully exercise headlessly — anything needing a paid step, a real SMS/2FA code, or human judgment of brand taste. And don't point it at a flow with no clear completion criterion; without a finish line the judge never stops.
