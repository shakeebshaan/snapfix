---
name: production-error-sweep
title: Production error sweep
category: Operations
trigger: schedule (nightly cron — runs unattended while you sleep)
goal: verifiable — no unaddressed actionable errors remain in the night's logs
source: Loop Library video (verbatim prompt)
---

## What it does

Once a night, an agent reads your production logs, separates noise from signal, and acts on the signal. For every error it judges *actionable*, it traces the root cause, ships a fix, verifies it, and opens a pull request — then it pings you in Slack with what it found and the PR link. If the logs are clean, it pings you to say so. You wake up to either a reviewable PR or an all-clear, never to a silent loop.

## Trigger

Scheduled, nightly. The loop runner shells out to your agent on a cron cadence — no human in the inner cycle. Set the trigger and schedule once:

```bash
# print the OS-scheduler line to install (cron on POSIX, Task Scheduler on Windows)
node tools/loop.mjs schedule --cron "0 3 * * *" \
  --agent 'claude -p "/production-error-sweep"'

# or run a single tick by hand to dry-run it before you trust the schedule
node tools/loop.mjs run --agent 'claude -p "/production-error-sweep"'
```

Point `--agent` at any CLI agent (`claude -p …`, `codex …`) — the runner only orchestrates; the agent does the work. The default cadence above is 3am local; pick the quietest hour for your traffic.

## Goal

**Verifiable.** "Done" means: every actionable error in the night's log window has been traced, fixed, and verified — or explicitly judged non-actionable — and you have been pinged exactly once with the outcome. The stopping condition is an empty actionable queue, not "the model feels finished." Two concrete sub-checks gate it:

- **Each fix is verified before the PR opens** — the relevant tests (and a reproduction of the original error) pass. An unverified fix is not a fix; the agent keeps working or escalates the item instead of opening a PR.
- **The Slack ping is mandatory and terminal** — findings + PR link when there was work, or an explicit all-clear when there wasn't. No silent exit either way.

The agent never merges. Landing stays a human decision; the loop's job is to deliver a verified, reviewable PR and a clear report.

## Prompt

```text
Every night, review our production logs for errors. If you find an actionable issue, trace it to its root cause, fix it, verify the fix, and open a pull request. Then ping me in Slack with the findings and PR link. If no actionable errors are present, ping me with that result instead.
```

## Notes / caveats

**Builds on the logging coverage loop.** This sweep is only as good as what your logs actually capture — it can't trace a root cause that was never logged. Run a logging coverage loop first (instrument error paths, structure log lines, ensure stack traces and request IDs survive to production) so this loop has real signal to read. Garbage logs in, garbage PRs out.

**Define "actionable" up front, or the agent will guess.** Give it an explicit filter: ignore known-noisy lines (third-party timeouts you can't fix, expected 4xx, deploy-window blips), de-duplicate by error signature, and set a frequency/severity floor so a single transient blip doesn't become a 2am PR. Without this the loop either spams you or chases ghosts.

**Token cost is real and unattended.** This is a long-running judge-then-fix loop firing while you sleep — root-cause tracing across logs and code, plus a verify pass per fix, can burn through tokens fast on a noisy night. Cap it: a max number of issues per run, a per-issue time/token budget, and a log window (last 24h, not all-time). Let it escalate the overflow to Slack rather than grinding all night.

**When NOT to use it.** Skip it if you have no structured production logging yet (fix that first — see above), if your "errors" need product judgment rather than a code fix (the agent will open low-value PRs), or if your prod and code aren't safely connected to a sandbox the agent can verify against. And never let it merge — keep a human on the landing gate. If your team can't review a nightly PR most mornings, dial the cron back to a cadence you'll actually keep up with.
