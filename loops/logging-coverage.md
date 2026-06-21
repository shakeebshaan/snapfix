---
name: logging-coverage
title: Logging coverage loop
category: Engineering
trigger: manual
goal: LLM-as-judge — every important path produces useful, tested logs
source: Loop Library video (verbatim prompt)
---

## What it does

Walks your system end to end, finds the important paths that run silent — the
ones where, when something breaks in production, you'd be left guessing — and
adds the missing logs. It doesn't stop at sprinkling `console.log`: each new log
is *useful* (right level, enough context to act on) and *tested* (an assertion
proves it fires). The agent loops until it judges the coverage complete, because
"important" can't be reduced to a single number.

## Trigger

Manual. Kick it off from your app repo with a Claude Code agent:

```bash
claude -p "/logging-coverage"
```

Or run it through the snapfix loop runner as a one-shot tick, overriding the
agent command for this loop:

```bash
node tools/loop.mjs run --agent 'claude -p "Review the system logging and add missing coverage until every important path produces useful, tested logs."'
```

Manual is the right trigger here: a logging sweep is a deliberate, bounded audit
you run after a feature lands or before a release — not something you want firing
on every push.

## Goal

**LLM-as-judge.** There is no deterministic "100% logged" metric — line coverage
tells you code *ran*, not that a *meaningful* event was recorded. So the model is
the judge: it decides when every important path produces a log that would
actually help during an incident.

"Done" means the agent can walk each important path — request entry/exit, auth
decisions, external calls, retries, fallbacks, error and catch branches,
background jobs, startup/shutdown — and for each one point to a log that (a) fires
at the right level, (b) carries enough context to act on (ids, outcomes, timings,
not just "error happened"), and (c) is covered by a test that asserts it emits.
The stopping condition is the judge's own verdict that no important path is left
silent and every added log has a test guarding it.

> Verifiable floor: because every log is *tested*, the loop still bottoms out on
> a green suite. The judge decides *what* to cover; the tests prove it *stays*
> covered. Run `npm test` (the project's `node --test`) before you accept the
> sweep.

## Prompt

```
Review the system logging and add missing coverage until every important path produces useful, tested logs.
```

## Notes / caveats

- **Token cost.** This is a judge loop over the whole system, so it can run long
  — the agent re-reads paths, adds a log, writes a test, and re-judges. Scope it
  (one service, one module, the request lifecycle) to keep a run bounded, then
  repeat. Pair it with a satisfaction bar you actually mean.
- **Judge drift.** "Important" is the model's call. Skim the diff: it should be
  adding signal at incident-relevant branches, not noise on every line. If it
  starts logging happy-path trivia at `error` level, tighten the prompt with your
  own definition of "important" and re-run.
- **Don't log secrets.** A logging sweep is exactly where tokens, PII, and
  request bodies leak into logs. Make redaction a non-negotiable in your review of
  the diff.
- **When not to use it.** Skip it for throwaway scripts and prototypes — logging
  discipline is for code you'll have to debug in production later. And don't run it
  on a red suite: fix the failing tests first, or the judge is reasoning about a
  system that doesn't work.
- **Pairs with the production error sweep.** This loop makes failures *observable*;
  the production error sweep loop makes them *go away*. Run the error sweep to hunt
  and kill real errors, then run this one so the next failure shows up in the logs
  instead of in a support ticket.
