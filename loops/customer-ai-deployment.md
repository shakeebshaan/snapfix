---
name: customer-ai-deployment
title: Customer AI deployment
category: Operations
trigger: manual (run on a customer request, a reported failure, or an ops review)
goal: both — one customer priority reaches a proven terminal state (agreed rollout stage, fixed issue, or escalated blocker)
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/customer-ai-deployment-loop/
---

## What it does

Drives a single customer AI workflow from idea to supervised production, one priority
at a time. The agent reviews the customer's feedback and history, picks one workflow —
enriching leads, drafting emails, summarizing meetings, updating a CRM — and pins down
its owner, inputs, approvals, success metric, and ROI hypothesis. It dry-runs the
workflow on realistic customer data, fixes the smallest verified problem it finds, then
releases through approved stages and monitors production. It finishes with the outcome,
the evidence, a customer update, lessons saved, and the next review scheduled. The whole
thing is supervised: gradual rollout with humans on the approval gates, not a fire-and-
forget deploy.

## Trigger

Manual. Run it on a concrete event — a customer asks for an AI workflow, reports a
failure, or hits an operations review:

```bash
claude -p "Run this when a customer requests an AI workflow, reports a failure, or reaches an operations review. Choose one priority, such as enriching leads, drafting emails, summarizing meetings, or updating a CRM. Define the owner, inputs, approvals, success metric, and ROI hypothesis. Dry-run it on realistic customer data, fix the smallest verified problem, then release through approved stages and monitor production. Finish with the outcome, evidence, customer update, lessons saved, and next review."
```

## Goal

**Both.** The verifiable side is the metric: the chosen workflow hits its defined
success metric on a dry-run over realistic customer data before it advances a stage.
The judged side is the supervised rollout: a human decides each stage is safe to
promote. "Done" means one customer priority reaches a *proven terminal state* — it hit
its agreed rollout stage, a production issue was fixed, or a blocker was escalated with
clear ownership and next steps. Two sub-checks gate it:

- **One priority, not a portfolio.** The loop advances a single workflow to a terminal
  state. Fanning out across five at once is how none of them reach proof.
- **Evidence and a defined metric up front.** Owner, inputs, approvals, success metric,
  and ROI hypothesis are set before the dry-run — otherwise "it works" has nothing to
  measure against.

## Prompt

```text
Run this when a customer requests an AI workflow, reports a failure, or reaches an operations review. Choose one priority, such as enriching leads, drafting emails, summarizing meetings, or updating a CRM. Define the owner, inputs, approvals, success metric, and ROI hypothesis. Dry-run it on realistic customer data, fix the smallest verified problem, then release through approved stages and monitor production. Finish with the outcome, evidence, customer update, lessons saved, and next review.
```

## Notes / caveats

**Realistic data is non-negotiable for the dry-run.** A workflow that passes on toy
inputs and fails on the customer's actual mess hasn't been validated — it's been
flattered. Dry-run on real (or faithfully realistic) customer data or the metric lies.

**The approval gates are the safety, so keep humans on them.** This is *supervised*
delivery into someone else's operations — the highest-blast-radius loop in the catalog.
The staged rollout and approval steps are not ceremony; they're the thing standing
between a bug and a customer's live workflow. Never let the loop self-promote past a
gate.

**Escalation is a valid terminal state.** "Blocked, escalated with a clear ask and
owner" is a finished run, not a failed one. The loop should hand off cleanly rather
than grind on a decision that isn't its to make.

**When NOT to use it.** Skip it for internal-only experiments (no customer ops at
stake, so the supervision overhead is wasted) and for any workflow you can't dry-run
safely against representative data — without that, you're testing in the customer's
production.
