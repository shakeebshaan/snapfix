---
name: artifact-to-skill
title: Artifact-to-skill
category: Evaluation
trigger: manual (run when a proven artifact's method will recur)
goal: verifiable — the extracted method succeeds on a fresh second case without the original artifact
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/artifact-to-skill-loop/
---

## What it does

Distills a proven artifact into a transferable skill, playbook, or procedure — and
then *checks that the distillation actually transfers*. The agent first records
evidence the source artifact succeeded and defines what success means, then extracts
the durable parts (the decisions, the sequence, the checks, the failure-avoidance
patterns) while deliberately dropping one-off context and surface style. It writes a
standalone method with defined inputs and boundaries, strips anything sensitive, then
hands it to an independent reviewer to apply to a fresh real case *without* the
original artifact. It revises at most twice and stops when the method clears the
quality bar on its own — or it honestly reports the method as not generalizable.

## Trigger

Manual. Run it when a finished artifact has credible success evidence and you can see
the same kind of work coming back around — that's the moment a one-off becomes worth
turning into a reusable procedure:

```bash
claude -p "Turn this artifact into a skill, playbook, or procedure. Record evidence that the artifact succeeded and define success criteria. Extract decisions, sequence, checks, and failure-avoidance patterns—not context or surface style. Remove sensitive material. Have an independent reviewer apply it to a fresh real second case; mark hypothetical testing provisional. Revise at most twice. Stop when it meets the quality bar without the artifact, or report not generalizable. Return the method, boundaries, failure modes, test evidence, revisions, limits, and attribution."
```

## Goal

**Verifiable (independent-apply).** "Done" means the extracted method succeeds on a
fresh, real *second* case — applied by an independent reviewer who never sees the
original artifact — and clears the quality bar. The independent re-application *is*
the test. Two sub-checks gate it:

- **Real case, not hypothetical.** If the method was only "tested" by imagining it
  works, the result is marked **provisional**, not done. A live second case is the
  bar.
- **Bounded revisions.** At most two revision passes. If it still fails the second
  case after that, the honest verdict is **not generalizable** — not another round of
  patching to force a pass.

## Prompt

```text
Turn [artifact] into a skill, playbook, or procedure. Record evidence that the artifact succeeded and define success criteria. Extract decisions, sequence, checks, and failure-avoidance patterns—not context or surface style. Remove sensitive material. Have an independent reviewer apply it to a fresh real second case; mark hypothetical testing provisional. Revise at most twice. Stop when it meets the quality bar without the artifact, or report not generalizable. Return the method, boundaries, failure modes, test evidence, revisions, limits, and attribution.
```

## Notes / caveats

**"Not generalizable" is a valid, valuable outcome.** The loop is allowed to fail
honestly — a method that works once but not twice was context, not a skill. Resist
rewriting the prompt to coerce a pass; a false "reusable" is worse than a true
"one-off," because you'll trust it on case three.

**Independence is the whole point.** The reviewer applying the method to the second
case must not have the original artifact to lean on — otherwise you've tested
copy-paste, not the procedure. Enforce the separation or the verification is theater.

**Strip secrets before extraction, not after.** The source artifact often carries
credentials, customer data, or internal specifics. Redaction is a first-class step in
the prompt — review the extracted method for leakage before it becomes a shared skill.

**When NOT to use it.** Skip it for work that won't recur (nothing to amortize) and
for artifacts whose success is unproven — extract from a win, not a draft. No success
evidence, no skill.
