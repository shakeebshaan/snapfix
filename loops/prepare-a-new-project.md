---
name: prepare-a-new-project
title: Prepare a new project
category: Engineering
trigger: manual (run before building, on the project docs)
goal: verifiable (reviewer) — two independent reviewers derive the same buildable system
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/prepare-new-project-loop/
---

## What it does

A planning loop that closes documentation gaps until the requirements, technical design,
tasks-with-acceptance-criteria, and test strategy together describe one buildable system.
Each round the agent fixes the single largest gap or contradiction that could make two
competent engineers build different things, keeps details traceable to stated requirements,
records its assumptions, and asks before forking a product decision. It rechecks
consistency across every artifact, then has two independent reviewers describe the
components, data model, dependencies, and definition of done — and loops until they agree.

## Trigger

Manual. Run it before you write code, pointed at the project's early docs — exactly when
those docs still leave important decisions open to interpretation. Use any CLI agent:

```text
claude -p "/prepare-a-new-project"
```

Or as a one-shot tick through the snapfix runner, overriding the agent command for this loop:

```text
node tools/loop.mjs run --agent 'claude -p "Prepare [project] for implementation: ensure its documents cover requirements, technical design, tasks with acceptance criteria, and test strategy. Each round, fix the largest gap or contradiction that could make two competent engineers build different systems; keep details traceable, record assumptions, and ask before product forks. Recheck consistency, then have two independent reviewers describe components, data model, dependencies, and definition of done. Stop when they materially agree and every artifact is testable, or a decision needs the user."'
```

## Goal

**Verifiable (reviewer gate).** "Done" means: two independent reviewers, reading only the
project documents, derive substantially the same build — their descriptions of components,
data model, dependencies, and definition of done materially agree — and every artifact is
specific, consistent, traceable, and testable. The loop also stops when a required product
decision blocks progress and needs the user. The two-reviewer agreement is the gate;
"the writer feels done" is not.

## Prompt

```text
Prepare [project] for implementation. Ensure its documents cover requirements, technical design, tasks with acceptance criteria, and test strategy. Each round, fix the largest gap or contradiction that could make two competent engineers build different systems. Keep details traceable, record assumptions, and ask before product forks. Recheck consistency, then have two independent reviewers describe the components, data model, dependencies, and definition of done. Stop when they materially agree and every artifact is testable, or a decision needs the user.
```

## Notes / caveats

**Reviewer agreement is the metric — keep it honest.** The stopping condition is two
independent reads converging, not a doc length. Don't let the agent pad documents or
invent requirements to manufacture agreement; every claim must trace back to a stated
requirement. Skim for fabricated specificity.

**Product forks are human-gated.** When a genuine product decision appears (which way to
build something the docs don't settle), the loop is told to ask, not guess. Expect it to
pause and surface those — answer them rather than letting it pick.

**Pairs with downstream build loops.** This loop's output is the contract everything else
reads. Run it first; a clean, testable spec is what makes the autonomy builder-reviewer
loop and the test loops actually converge instead of thrashing on ambiguity.

**When NOT to use it.** Overkill for a throwaway spike or a one-file change where the
"spec" is obvious. Its value is proportional to how many engineers (or agents) will read
the docs and how expensive a wrong build would be.
