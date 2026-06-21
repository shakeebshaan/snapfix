---
name: sub-50ms-page-load
title: Sub-50ms page-load loop
category: Engineering
trigger: manual (can be scheduled / on PR open)
goal: verifiable — every page loads in under 50 ms
source: Loop Library video (verbatim prompt)
---

## What it does

Points an AI coding agent at your app and lets it optimize for raw page-load speed, autonomously, until a hard number is met: **every page loads in under 50 ms**. After each meaningful change the agent re-measures load time across *all* pages under one fixed, repeatable test setup, so the metric never drifts. It keeps tightening — caching, payload, render path, queries — and stops only when the slowest page clears the bar. This is the textbook **verifiable** loop: a deterministic threshold decides "done," not the model's opinion.

## Trigger

Manual is the default — kick it off from your app repo whenever you want a speed pass:

```bash
claude -p "$(cat loops/sub-50ms-page-load.md | sed -n '/```text/,/```/p')"
```

Or just open Claude Code in the repo and paste the **Prompt** block below.

To remove yourself from the cycle, wire it to a trigger via the snapfix runner (see `LOOP.md` §6). Schedule it nightly, or fire it on every PR:

```bash
# schedule: print the OS-scheduler line, run the agent at 2am
node tools/loop.mjs schedule --cron "0 2 * * *"

# action: re-run on each new PR (point agentCmd at this loop's prompt)
node tools/loop.mjs watch --interval 60
```

Set `loop.schedule.agentCmd` (in `qa.config.json`) to the agent invocation that feeds it this prompt, so every trigger runs the same loop.

## Goal

**Verifiable.** "Done" is a single unambiguous condition: the measured load time of **every** page is **< 50 ms**, taken under the *same repeatable test conditions* every time (same machine/runner, same network profile, same cache state, same number of samples, same percentile). The loop runs until the slowest page clears 50 ms; then it stops. There is no judgment call and no satisfaction slider — the number either passes or it doesn't.

Lock the measurement down before you start, or the goal is meaningless:

- **One harness, one config.** Same tool (e.g. Lighthouse, `autocannon`, a Playwright timing script), same flags, every run.
- **Same conditions.** Pin CPU/network throttling, viewport, and cold-vs-warm cache. State them in the prompt so the agent can't move the goalposts.
- **A clear statistic.** Decide up front: is "< 50 ms" the median, the p95, or the max across N runs? "Every page < 50 ms" means the *slowest qualifying page on the chosen statistic* is under 50 ms.

## Prompt

Quote the transcript prompt verbatim. This is the canonical example of a verifiable loop from the Loop Library:

```text
Continue optimizing the code for speed. After each significant change, measure page-load performance across every page under the same repeatable test conditions. Continue until every page loads in under 50 ms.
```

## Notes / caveats

- **Token cost is real and unbounded-ish.** This loop runs until a hard number is hit; if your app is far from 50 ms, that's many measure-change-remeasure cycles. Cap it — a max-iterations or wall-clock budget — and treat a budget exhaustion as "report the best result," not "fake the number."
- **The metric is only as honest as the harness.** If the test conditions wobble (warm cache one run, cold the next; a noisy laptop under load), the agent will chase ghosts or, worse, declare victory on a flattering sample. Pin everything *before* the first run. Garbage-in measurement is the #1 failure mode of verifiable loops.
- **50 ms is a server/render target, not a promise to every real user.** Network RTT, third-party scripts, and client devices live outside most repeatable harnesses. Be explicit about *what* you're measuring (TTFB? full load? a specific Web Vital?) so "under 50 ms" means one thing.
- **Watch for the speed-vs-correctness tradeoff.** An agent optimizing a single metric can cut corners that break behavior (over-aggressive caching, dropped revalidation, removed work that mattered). Run this loop **with your test suite as a guardrail** — keep `loop.goal.tests.required: true` so a fix that's fast *and* broken can't pass. Speed under green tests, not speed instead of tests.
- **When not to use it.** Don't reach for this when the bottleneck is architectural or external (a slow upstream API, an N+1 nobody's allowed to touch this sprint, a hosting tier) — the agent will spin without authority to fix the real cause. And skip it for pages where 50 ms is the wrong bar; pick a threshold that reflects the page's job before you let a loop enforce it.
