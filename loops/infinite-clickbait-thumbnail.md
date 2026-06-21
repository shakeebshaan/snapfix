---
name: infinite-clickbait-thumbnail
title: Infinite clickbait thumbnail
category: Content
trigger: manual (on demand per video)
goal: LLM-as-judge (visual rubric) — top concept clears the quality threshold, or the budget runs out
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/infinite-clickbait-loop/
---

## What it does

A thumbnail workflow that creates ten concepts, scores the top three against a relevant
YouTube channel, and improves the winner without misleading viewers. For a given video,
the agent generates ten thumbnail concepts from approved assets, then **scores each at
real YouTube sizes** on clarity, curiosity, emotional pull, contrast, and accuracy.
It takes the top three, fixes each one's weakest dimension, rescores under the same
rubric, and keeps iterating the strongest concept until it clears a quality threshold or
the budget ends. Anything the video can't actually deliver gets rejected — no bait.

## Trigger

Manual, per video. Paste the prompt straight into a CLI agent, filling the brackets:

```bash
claude -p "For [video], use [approved assets] to make ten thumbnail concepts. Score each at real YouTube sizes against [inspiration channel] for clarity, curiosity, emotional pull, contrast, and accuracy. Take the top three, improve each one's weakest dimension, and rescore them under the same rubric. Keep iterating the strongest concept until it clears [quality threshold] or [budget] ends. Reject anything the video cannot deliver. Return the winner, two runners-up, previews, final scores, and rationale."
```

## Goal

**LLM-as-judge (visual rubric).** "Done" means: the strongest concept clears the
named `[quality threshold]` under the five-dimension rubric scored at real YouTube
sizes — *or* `[budget]` runs out, whichever comes first. The accuracy dimension is a
hard gate: a concept that promises something the video can't deliver is rejected
regardless of how well it scores everywhere else.

## Prompt

```text
For [video], use [approved assets] to make ten thumbnail concepts. Score each at real YouTube sizes against [inspiration channel] for clarity, curiosity, emotional pull, contrast, and accuracy. Take the top three, improve each one's weakest dimension, and rescore them under the same rubric. Keep iterating the strongest concept until it clears [quality threshold] or [budget] ends. Reject anything the video cannot deliver. Return the winner, two runners-up, previews, final scores, and rationale.
```

## Notes / caveats

**"Looks clickable" is LLM-as-judge and brittle.** The whole stopping condition is the
model grading its own thumbnails against a rubric — scores drift run to run. Pair it with
a verifiable floor where you can: render at the actual 1280x720 and mobile-tray sizes and
check text legibility, a contrast/a11y check on the title text, and a fixed asset
whitelist so it can't invent faces or logos.

**The budget cap is mandatory.** Without a real `[budget]` (max rounds or token ceiling)
this is a literally infinite loop — the prompt's name is honest. Always fill the bracket.

**The accuracy dimension is the ethics rail.** "Reject anything the video cannot deliver"
is what separates a strong thumbnail from a deceptive one. Keep it weighted high; a loop
optimizing curiosity alone will happily produce misleading bait.

**When NOT to use it.** Skip when you don't have an `[inspiration channel]` to score
against (the rubric loses its anchor), or when brand guidelines forbid the
high-contrast/high-curiosity aesthetic this loop optimizes toward.
