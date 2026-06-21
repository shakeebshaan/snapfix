---
name: promise-to-proof
title: Promise-to-proof
category: Evaluation
trigger: manual (when messaging may have drifted from what the product actually does)
goal: verifiable — no high-risk unsupported promise remains and every promise links to current evidence
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/promise-to-proof-loop/
---

## What it does

Audits the gap between what a product *claims* and what it *does*. The agent enumerates every customer-facing promise across marketing, documentation, demos, and AI answers, then compares each one to current product behavior and labels it: proven, partly proven, misleading, unsupported, outdated, or missing evidence. It fixes or narrows the **riskiest mismatch** first, re-runs the affected check, and repeats — tightening the loop until no high-risk unsupported promise is left standing and each promise is backed by current evidence. It asks before touching any production or public copy.

## Trigger

Manual. Run it when you suspect messaging has outpaced (or fallen behind) the product — post-pivot, post-deprecation, or before a launch where over-claiming is a real risk. Any CLI agent works — bring-your-own:

```bash
claude -p "List every customer-facing promise this product makes in marketing, documentation, demos, and AI answers. Compare each promise with current product behavior and evidence, then label it proven, partly proven, misleading, unsupported, outdated, or missing evidence. Fix or narrow the riskiest mismatch and rerun the affected check. Repeat until no high-risk unsupported promise remains. Ask before changing production or public copy. Return the promises, evidence, fixes, and decisions needed."
```

No schedule/watch wiring — it touches public copy, so a human kicks it off and approves changes.

## Goal

**Verifiable.** "Done" means: **no high-risk unsupported promise remains**, and every promise links to current evidence of the behavior it claims. The stopping condition is an empty high-risk queue with an evidence trail, not the model's say-so. Two sub-checks gate it:

- **Every promise carries a label and a link** — proven/partly/misleading/unsupported/outdated/missing, each tied to the check that confirms (or refutes) it. Unlabeled is unfinished.
- **Riskiest-first, re-verified** — the agent fixes or narrows the highest-risk mismatch, then re-runs that specific check before moving on, so a "fix" is proven, not asserted.

## Prompt

```text
List every customer-facing promise [product] makes in marketing, documentation, demos, and AI answers. Compare each promise with current product behavior and evidence, then label it proven, partly proven, misleading, unsupported, outdated, or missing evidence. Fix or narrow the riskiest mismatch and rerun the affected check. Repeat until no high-risk unsupported promise remains. Ask before changing production or public copy. Return the promises, evidence, fixes, and decisions needed.
```

## Notes / caveats

**The agent asks before changing public copy — keep it that way.** Marketing and docs are blast-radius surfaces: a wrong "fix" to a landing page or pricing claim can do more damage than the original mismatch. The loop is built to pause for approval before editing production or public copy. Don't auto-approve it.

**"Evidence" must be checkable, not narrative.** A promise is only "proven" if it links to something concrete — a passing test, a working demo, a screenshot, a metric. If the agent can only argue a claim is true, that's "partly proven" at best. Define what counts as evidence up front or the labels drift into opinion.

**Inventory cost scales with surface area.** A product with sprawling marketing, multiple docs sites, and an AI assistant has a lot of promises to enumerate. Scope the surfaces you actually want audited (e.g. just the pricing page and primary docs) rather than "everything," or the inventory pass alone gets expensive.

**When NOT to use it.** Skip it for a product mid-flux where the claims are deliberately ahead of shipping reality (you'll just relabel everything "outdated"), when you have no authority to change the copy it'll flag, or for internal-only tools with no customer-facing promises to audit.
