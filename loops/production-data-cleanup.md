---
name: production-data-cleanup
title: Production data cleanup
category: Operations
trigger: manual (run when prod data has drifted from current definitions)
goal: verifiable — every remaining record meets the allowed definition, confirmed by a post-cleanup audit
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/production-data-cleanup-loop/
---

## What it does

Cleans a production dataset that has drifted out of line with current policies,
taxonomies, or quality standards — and fixes the classifier that let the drift in, so
it doesn't recur. The agent works in four stages: (1) write down the explicit
inclusion/exclusion rules for what *belongs*; (2) audit the records against those
rules, separating clear violations from uncertain cases; (3) remove the invalid
records and improve the classification logic, capturing the removed cases as regression
examples; (4) re-test against a representative sample until every record meets the
definition. It treats the symptom (bad records) and the cause (a classifier that
admitted them) in the same pass.

## Trigger

Manual. Run it when you've noticed production data carrying records that violate your
current definitions — a taxonomy changed, a policy tightened, or a classifier was
quietly mislabeling:

```bash
claude -p "Review production records, remove anything that does not meet the allowed definition, improve the classification logic, and verify the remaining data."
```

Define the "allowed definition" explicitly before you run it — the loop's first stage
is making those rules concrete, and a vague definition produces a vague (and dangerous)
cleanup.

## Goal

**Verifiable (review).** "Done" means every remaining record meets the allowed
definition, confirmed by a representative classification test and a post-cleanup audit.
The stopping condition is a clean sampled audit, not "the model removed some rows." Two
sub-checks gate it:

- **The classifier is improved, not just the data.** Removing bad records without
  fixing the logic that admitted them guarantees the next batch re-drifts. The removed
  cases become regression examples that keep the classifier honest.
- **Uncertain cases are separated, not deleted.** Clear violations go; ambiguous
  records are set aside for review rather than swept out — over-deletion on production
  data is the failure mode that has no undo.

## Prompt

```text
Review production records, remove anything that does not meet the allowed definition, improve the classification logic, and verify the remaining data.
```

## Notes / caveats

**This touches production data — make it reversible.** Deletion is the least
reversible operation in the catalog. Run against a snapshot or with soft-deletes and a
restore path first; never let the agent hard-delete from live tables on a single pass.
Confirm the rules on a sample before you authorize the full sweep.

**A vague definition is the whole risk.** The agent removes whatever fails the
"allowed definition." If that definition is fuzzy, it either deletes records it
shouldn't or leaves the mess it was sent to clean. Stage one — writing explicit
inclusion/exclusion rules — is where this loop is won or lost.

**Keep humans on the uncertain pile.** The clear violations are safe to automate; the
ambiguous cases are exactly where product judgment belongs. The loop's job is to
shrink the human's review queue to just the genuine edge cases, not to guess on them.

**When NOT to use it.** Skip it when the dataset has no agreed definition yet (define
it first — that's a human call), or when "wrong" records are actually a legitimate
historical state you need to preserve. Don't clean data you'll wish you'd kept.
