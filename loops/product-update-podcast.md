---
name: product-update-podcast
title: Product-update podcast
category: Content
trigger: schedule (nightly)
goal: verifiable (review) — a draft episode passes the accuracy/clarity review, or no episode is made
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/product-update-podcast-loop/
---

## What it does

A scheduled editorial workflow that turns meaningful public product changes into a
short, source-grounded podcast episode. Each night the agent reviews what publicly
shipped, keeps only the changes users actually need to know, and **verifies each one
against the product, docs, or release notes** before it goes anywhere. Approved changes
are turned into a three-to-five-minute episode (via the Jellypod MCP) explaining what
changed, why it matters, and how to try it — then the script and audio are checked for
accuracy, clarity, and pronunciation. If nothing meaningful shipped, it makes no episode.

## Trigger

Scheduled, nightly. Point `qa.config.json → loop.schedule.agentCmd` at this loop's
invocation, then install the cron line:

```bash
node tools/loop.mjs schedule --cron "0 2 * * *"   # 02:00 nightly; prints the OS-scheduler line to install
```

The runner shells out to whatever `agentCmd` you set on each tick (`claude -p "…"`,
`codex …`). It orchestrates; the agent does the editorial work.

## Goal

**Verifiable (review gate).** "Done" means: a draft episode whose script and audio have
passed the accuracy/clarity/pronunciation review against verified sources — *or* an
explicit "no meaningful change shipped, no episode" result. Two gates: every selected
change is **fact-checked against product/docs/release notes** before scripting, and the
run **ends with the draft, its sources, and the review result** in hand. Publishing is
not automatic — the loop asks before it ships.

## Prompt

```text
Each night, review publicly released product changes and select only those users need to know. Verify each against the product, docs, or release notes. Use the Jellypod MCP to turn the approved changes into a three-to-five-minute podcast explaining what changed, why it matters, and how to try it. Check the script and audio for accuracy, clarity, and pronunciation. If nothing meaningful shipped, make no episode. Ask before publishing. Finish with the draft episode, sources, and review result.
```

## Notes / caveats

**Needs the Jellypod MCP wired up.** Audio generation depends on the Jellypod MCP being
available to your agent — without it the loop can draft a script but not produce the
episode. Confirm the MCP connection before you trust the nightly cadence.

**Source grounding is the whole point.** The verify-against-docs step is what keeps the
loop from narrating hallucinated changelogs. Don't loosen it — an unverified "change" is
worse than a missed one. If your release notes are thin, this loop has little signal to
work from.

**Publishing stays human-gated.** The prompt's "ask before publishing" is load-bearing.
Keep a human on the publish button; let the loop deliver the draft + sources + review and
stop there. If nobody reviews most mornings, dial the cron back.

**When NOT to use it.** Skip on quiet products that ship rarely (you'll mostly get
"no episode"), or when "what users need to know" requires product judgment the agent
can't infer from public artifacts alone.
