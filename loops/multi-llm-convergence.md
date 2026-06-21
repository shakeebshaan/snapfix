---
name: multi-llm-convergence
title: Multi-LLM convergence
category: Evaluation
trigger: manual (a high-stakes review you want two model families to bless)
goal: both — two reviewers from different providers both approve the same unchanged version (LLM judgment, gated by a hard pass limit)
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/multi-llm-convergence-loop/
---

## What it does

Alternates a plan, spec, document, or code change between **two genuinely different model families** — AI systems from separate providers — and keeps cycling until *both* approve the **same unchanged version**. Each reviewer verifies its own findings and applies only the necessary fixes, then hands the revised version to the other reviewer. Convergence on identical, untouched content is the win; the point is to borrow independent perspectives so one family's blind spot gets caught by the other. It stops on dual approval, or bails on the pass limit, oscillating disagreement, a reviewer being unavailable, or a required human approval boundary.

## Trigger

Manual. Reach for it on a high-stakes artifact where one model's sign-off isn't enough. You'll need two different-provider CLIs on hand (e.g. `claude` and `codex`) — bring-your-own:

```bash
claude -p "Review this plan against the quality bar for at most 5 rounds. Have two genuinely different model families—AI systems from separate providers—review it. Verify each finding and apply only necessary fixes, then give the revised version to the other reviewer. Succeed only when both approve the same unchanged version. Stop at the limit, repeating disagreement (oscillation), unavailable review, or required approval. Return the final work, round log, verdict, and disagreements."
```

No schedule/watch wiring — convergence is a deliberate, human-initiated gate.

## Goal

**Both.** The deterministic half: a hard **pass limit** caps the rounds, and "same unchanged version" is a literal, checkable condition — no diff between what each reviewer approved. The judgment half: each reviewer is an LLM deciding whether the bar is met. "Done" means **both providers approve identical, untouched content**. Two sub-checks gate it:

- **Reviewers are from separate providers** — same-family reviewers share blind spots and converge on agreement that proves nothing.
- **Oscillation is a stop, not a loop** — if reviewers keep undoing each other, the loop halts and reports the disagreement instead of churning to the pass limit.

## Prompt

```text
Review [plan, specification, document, or code change] against [quality bar] for at most [pass limit] rounds. Have one of two genuinely different model families—AI systems from separate providers—review it. Verify each finding and apply only necessary fixes, then give the revised version to the other reviewer. Succeed only when both approve the same unchanged version. Stop at the limit, repeating disagreement (oscillation), unavailable review, or required approval. Return the final work, round log, verdict, and disagreements.
```

## Notes / caveats

**Two providers is the whole premise — wire it before you run.** The value is *independent* judgment; reviewing with two instances of the same model is theater. You need a second provider's CLI installed and authenticated (`codex`, or another family) alongside your primary. If you only have one family, this loop has nothing to offer over a single review.

**Set a low pass limit and respect oscillation.** Without a cap, two reviewers can volley fixes indefinitely. A handful of rounds is usually enough to converge or to expose a genuine disagreement worth a human's eyes. Treat persistent oscillation as signal — the reviewers found a real fork, not noise to grind through.

**Token cost is two reviews per round, plus fixes.** Every round pays both providers; budget accordingly and keep the limit tight.

**When NOT to use it.** Skip it for low-stakes or routine artifacts (one review is plenty), when the subject needs human product judgment rather than model review, or when you can't supply a second provider. It's a high-stakes convergence gate, not an everyday check.
