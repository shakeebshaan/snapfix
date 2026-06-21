---
name: pixel-safe-css-trim
title: Pixel-safe CSS trim
category: Engineering
trigger: manual (run on a site with suspected unused/redundant CSS)
goal: verifiable (pixel-identical) — delivered CSS is smaller while every tested screen stays pixel-identical
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/pixel-safe-css-trim-loop/
---

## What it does

Shrinks the CSS you ship without changing how tested screens look. The agent first
captures representative pages across sizes, themes, and interactions and records the built
CSS size. It treats coverage reports as suggestions only — never proof — then removes one
declaration or rule, rebuilds, and reruns the screenshots and project checks. A removal is
kept only if every screenshot is pixel-identical and the built CSS is smaller; otherwise
it's reverted. It repeats one rule at a time until no supported candidate remains.

## Trigger

Manual. Run it when a stylesheet has accumulated dead or redundant rules and you want it
leaner without a visual regression. Use any CLI agent:

```text
claude -p "/pixel-safe-css-trim"
```

Or as a one-shot tick through the snapfix runner, overriding the agent command for this loop:

```text
node tools/loop.mjs run --agent 'claude -p "Reduce the CSS styling code [site] sends to users without changing tested screens. First capture representative pages, sizes, themes, and interactions, and record the built CSS size. Treat coverage reports only as suggestions. Remove one declaration or rule, rebuild, and rerun screenshots and project checks. Keep it only if every screenshot is pixel-identical and built CSS is smaller; otherwise revert. Stop when no supported candidate remains, progress stalls, or approval is required. Return reduction, evidence, and untested states."'
```

## Goal

**Verifiable (pixel-identical).** "Done" means: the delivered stylesheet is smaller while
every tested screen remains pixel-identical. The loop also stops when no supported
candidate remains, progress stalls, or approval is required. Two gates decide each removal:
every screenshot pixel-identical *and* built CSS smaller — fail either and the rule goes
back.

## Prompt

```text
Reduce the CSS styling code [site] sends to users without changing tested screens. First capture representative pages, sizes, themes, and interactions, and record the built CSS size. Treat coverage reports only as suggestions. Remove one declaration or rule, rebuild, and rerun screenshots and project checks. Keep it only if every screenshot is pixel-identical and built CSS is smaller; otherwise revert. Stop when no supported candidate remains, progress stalls, or approval is required. Return reduction, evidence, and untested states.
```

## Notes / caveats

**Coverage reports suggest; screenshots prove.** A CSS coverage tool flags rules that
*weren't hit* on the pages it saw — it cannot prove a rule is unnecessary across themes,
breakpoints, and interaction states. The agent is told to treat it as a hint only; the
pixel diff is the real gate. Don't shortcut to "coverage says it's dead, delete it."

**Capture breadth = safety.** What you don't screenshot, you can't protect. Include hover
and focus states, dark/light themes, mobile and desktop, and any JS-toggled classes —
otherwise a "pixel-safe" removal can break an uncaptured state.

**Untested contexts stay risky.** The loop returns its untested states explicitly. Browsers,
viewports, and interactions outside your capture set are unverified by definition — review
that list before shipping.

**When NOT to use it.** Skip it without a reliable screenshot baseline and a build step
that reports CSS size — both gates are required. And one-rule-at-a-time is deliberate; if
you want a bulk purge with no pixel proof, that's a different (riskier) job.
