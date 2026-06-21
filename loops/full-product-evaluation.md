---
name: full-product-evaluation
title: Full product evaluation loop
category: Evaluation
trigger: manual
goal: LLM-as-judge — every scenario meets the original quality bar
source: Loop Library video (verbatim prompt)
---

## What it does

Builds a complete behavioral test sweep across **every major capability** of a product,
runs each scenario under identical conditions, and grades the results against a quality
bar the agent sets *before* it starts. Anything below the bar gets root-caused, fixed,
and re-run — then the whole sweep runs again to catch regressions. It's the
acceptance-test loop: the agent doesn't stop until the entire product clears the bar it
agreed to up front.

## Trigger

Manual. Kick it off when you want a full-coverage quality read — a pre-release gate, a
post-refactor sanity sweep, or a "is this actually good yet?" checkpoint.

```bash
# From your app's project directory, with the fix-issues skill installed:
claude -p "/fix-issues run the full product evaluation loop in loops/full-product-evaluation.md"

# Or kick it straight from the prompt:
claude
> Run the loop described in loops/full-product-evaluation.md. N = 20.
```

There's no schedule or watch wiring for this one by design — it's expensive and
long-running (see caveats), so a human decides when to spend on it.

## Goal

**LLM-as-judge.** Before any testing, the agent writes down explicit success criteria
and picks **one** evaluation method (pass/fail checks or a scoring rubric) and applies it
uniformly. "Done" means **every** scenario meets the original quality bar in a clean
end-to-end run — not "most," not "the ones I re-ran." The stopping condition is a full
sweep with zero scenarios below the bar. Because the judge is the model, the bar must be
written down once and held fixed for the whole loop; moving it mid-run invalidates the
result.

> Pair it with a verifiable floor when you can: if the product has a test suite, gate on
> `node tools/loop.mjs verify` (tests green + coverage) *and* the judge sweep. Verifiable
> is the floor; the scenario bar is the ceiling.

## Prompt

```text
Create N realistic scenarios covering every major capability. Before testing, define clear success criteria and choose a consistent evaluation method, such as pass/fail checks or a scoring rubric. Run every scenario under the same conditions and record evidence for each outcome. Fix the underlying cause of anything that does not meet the criteria, rerun the affected scenarios, and then rerun the complete test. Continue until every scenario meets the original quality bar.
```

Replace `N` with a real count before you run (e.g. 20). Keep the success criteria and the
evaluation method fixed for the entire loop — defining them once, up front, is what makes
the final pass meaningful.

## Notes / caveats

- **Long-running and token-hungry.** A full sweep with fix → re-run → full re-run cycles
  can run **12 hours or more** on a real product. Each failure that triggers a re-run
  pays for the affected scenarios *and* a fresh end-to-end pass. Budget tokens and wall
  clock accordingly, and consider running it overnight.
- **Non-deterministic.** Both the scenarios and the LLM-as-judge grading vary run to run,
  so a green sweep is strong evidence, not a proof. Re-running can surface things the last
  pass missed — that's the loop working, not a bug.
- **Cost caveat.** This is one of the most expensive loops in the library. Reach for it at
  real gates (pre-release, post-major-refactor), not as a routine check — for everyday
  bug work the fix-issues loop is far cheaper.
- **When NOT to use it.** Skip it for a single bug or a narrow change (use the fix-issues
  loop), for open-ended feature exploration (loops wander on divergent goals), or when you
  can't hold the quality bar fixed for the whole run — a moving bar makes the final pass
  meaningless.
