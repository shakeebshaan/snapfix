---
name: accessibility-repair
title: Accessibility repair
category: Engineering
trigger: manual (run on pages/components with a defined a11y target)
goal: verifiable (standards) — no confirmed barrier remains against the agreed standard
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/accessibility-repair-loop/
---

## What it does

Drives a site or app toward an agreed accessibility standard (e.g. WCAG 2.2 AA) one fix at
a time. The agent checks the scope with automated scans plus available manual tests —
keyboard, screen-reader, and others — confirms each issue is real, ranks issues by harm,
and fixes the single highest-impact blocker. It then reruns the same checks, the affected
task, and regression tests, keeping only verified fixes. It repeats until no confirmed
barrier remains, never silencing a check or weakening the target to make progress.

## Trigger

Manual. Run it when you have a defined accessibility target and concrete pages, components,
or user tasks to test against. Fill in the scope and standard before launching, with any
CLI agent:

```text
claude -p "/accessibility-repair"
```

Or as a one-shot tick through the snapfix runner, overriding the agent command for this loop:

```text
node tools/loop.mjs run --agent 'claude -p "Check [scope] against [accessibility standard, such as WCAG 2.2 AA] with automated scans and available keyboard, screen-reader, and other manual tests. Confirm each issue, rank it by harm, and fix the highest-impact blocker. Rerun the same checks, affected task, and regression tests. Keep only verified fixes. Stop when no blocker remains, progress stalls, verification is unavailable, or approval is required. Never silence a check or weaken the target. Return issues, fixes, evidence, exceptions, and untested needs."'
```

## Goal

**Verifiable (standards).** "Done" means: no confirmed accessibility barrier remains in the
agreed pages, components, or user tasks, measured against the chosen standard. The loop also
stops if progress stalls, verification is unavailable, or approval is required. Each fix is
gated by rerunning the same automated + manual checks, the affected task, and regression
tests — only verified fixes are kept, and the target is never weakened to claim done.

## Prompt

```text
Check [scope] against [accessibility standard, such as WCAG 2.2 AA] with automated scans and available keyboard, screen-reader, and other manual tests. Confirm each issue, rank it by harm, and fix the highest-impact blocker. Rerun the same checks, affected task, and regression tests. Keep only verified fixes. Stop when no blocker remains, progress stalls, verification is unavailable, or approval is required. Never silence a check or weaken the target. Return issues, fixes, evidence, exceptions, and untested needs.
```

## Notes / caveats

**Automated scans can't prove accessibility.** They find *likely* problems; they cannot
prove a product is usable. The loop is explicit that keyboard and screen-reader testing
matter — budget for the manual passes, and treat a clean axe/Lighthouse run as necessary,
not sufficient.

**Never silence a check or weaken the target.** The fastest way to a "green" report is to
suppress a rule or drop from AA to A — both are forbidden here. In review, watch for
disabled checks and quietly lowered targets; that's regression dressed as progress.

**Confirm before fixing, rank by harm.** Each issue is confirmed real and ranked by user
impact so the highest-impact blocker goes first. This keeps the loop from burning time on
low-harm lint noise while a keyboard trap sits unfixed.

**When NOT to use it.** Skip it until you've agreed a standard and have testable pages — an
undefined target gives the agent nothing to verify against. And the "untested needs" it
returns (assistive tech, real-user testing you couldn't run) are open risk, not closed
items.
