---
name: fresh-clone
title: Fresh clone
category: Design
trigger: manual (run when onboarding clarity is uncertain)
goal: verifiable (reproducible) — one uninterrupted fresh clone reaches the documented ready state using only the README
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/fresh-clone-loop/
---

## What it does

Clones your repo into a disposable, empty environment and follows *only* the README to the documented ready state — app running, package built, whatever the docs promise. The instant a step fails or quietly assumes knowledge that isn't written down, the agent records the gap, fixes the smallest setup-or-docs issue, then throws the whole environment away and starts over from a clean clone. Nothing — dependencies, config, credentials, prior repairs — survives between attempts. It repeats until one uninterrupted run reaches ready, or progress stalls. Destroying the environment after each repair is the whole trick: it stops accumulated local state from masking the *next* problem your README is missing.

## Trigger

Manual. You read the diffs and the gap list, so be around for the run.

```bash
claude -p "Clone [repository] into a disposable environment and follow only its README to the documented ready state, such as running the app or building the package. When a step fails or assumes missing knowledge, record the gap, fix the setup or documentation issue, discard the environment, and start again. Carry no dependencies, configuration, credentials, or repairs between attempts. Stop when one uninterrupted fresh clone reaches that state, progress stalls, or [budget] ends. Return exact commands, gaps closed, and remaining blockers."
```

To drive it through snapfix's runner, point `qa.config.json → loop.schedule.agentCmd` at this prompt and `node tools/loop.mjs run` it.

## Goal

**Verifiable (reproducible).** "Done" means: a single, uninterrupted clean clone reaches the documented ready state using nothing but the README — no hidden steps, no operator help, no leftover state. The verifiable floor is exactly that: *a fresh clone reaches value with no hidden steps.* Two sub-checks gate it:

- **Every attempt starts from a discarded environment** — if repairs or deps leak between tries, the run doesn't count.
- **Only README guidance is used** — undocumented knowledge the agent supplies is itself a recorded gap, not a pass.

It also stops on stalled progress or an exhausted budget — both honest non-passes that hand you the remaining blocker list.

## Prompt

```text
Clone [repository] into a disposable environment and follow only its README to the documented ready state, such as running the app or building the package. When a step fails or assumes missing knowledge, record the gap, fix the setup or documentation issue, discard the environment, and start again. Carry no dependencies, configuration, credentials, or repairs between attempts. Stop when one uninterrupted fresh clone reaches that state, progress stalls, or [budget] ends. Return exact commands, gaps closed, and remaining blockers.
```

## Notes / caveats

**The disposable environment is the contract, not a detail.** A container, fresh VM, or throwaway temp dir — anything the agent can nuke and recreate cheaply. If "discard" is faked (reusing a dirty checkout, keeping `node_modules`), local state hides the very gaps you're hunting and the green run is a lie. Make teardown real.

**It edits docs *and* setup, so review both.** A "fix" might be a one-line README addition or a changed install script. The first kind is cheap and safe; the second crosses into behavior — read those diffs before trusting them.

**Token cost scales with how broken your README is.** Each gap is a full clone-fail-fix-discard cycle. A docs file with ten hidden assumptions is ten restarts. Set `[budget]` (a step or time cap) so a deeply under-documented repo escalates its blocker list instead of grinding.

**When NOT to use it.** Skip it if your ready state can't be reached headlessly (needs a GUI login, a paid third-party key, manual hardware). The agent will stall on the human-gated step and report a blocker — useful, but cheaper to know up front.
