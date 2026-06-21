---
name: recent-feedback-sweep
title: Recent feedback sweep
category: Evaluation
trigger: manual (run after several days of feedback have piled up)
goal: verifiable — the issue inventory is closed and a fresh pattern audit comes back clean
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/recent-feedback-sweep/
---

## What it does

Turns a backlog of "you reported X was broken" threads into a systemic audit. The
agent pulls every complaint from a lookback window, deduplicates them into a clean
issue list, then groups those into *failure patterns* — not "this one button," but
"the class of thing this button is an instance of." It scans the whole project for
every other place that pattern shows up, fixes each confirmed hit, and adds
regression coverage where practical. Then it re-audits. It keeps looping until a
fresh pass finds nothing new or the iteration budget runs out, stopping on anything
blocked or approval-gated.

## Trigger

Manual. Run it after a few days of feedback have accumulated, when the complaints
start rhyming and you suspect a systemic root rather than isolated bugs:

```bash
claude -p "Review all available threads from the last 7 days where I reported something wrong with this project and asked for a fix. Build a deduplicated issue list, group it into failure patterns, and verify current state. Audit the complete project for every pattern, fix each confirmed instance, and add regression coverage where practical. Repeat the full audit until it finds no remaining instance or 5 passes ends. Stop on blocked or approval-gated work. Return the issues, fixes, evidence, and blockers."
```

Fill in the `[lookback window]` and `[iteration budget]` placeholders before you run
it — the audit's scope and cost both live in those two blanks.

## Goal

**Verifiable (audit).** "Done" means the issue inventory is closed *and* a fresh
pattern audit comes back clean — every reported issue has current proof of
resolution, and a re-scan turns up no new instances of any pattern. Two sub-checks
gate it:

- **Patterns, not tickets.** The stopping condition is an empty *pattern* queue, not
  an empty *complaint* queue. Fixing the reported button without scanning for its
  siblings is a partial pass, not a done one.
- **Regression coverage where practical.** A fix without a guarding test is one the
  next sweep finds again. The clean final audit is the gate; the tests keep it clean.

## Prompt

```text
Review all available threads from [lookback window] where I reported something wrong with [project] and asked for a fix. Build a deduplicated issue list, group it into failure patterns, and verify current state. Audit the complete project for every pattern, fix each confirmed instance, and add regression coverage where practical. Repeat the full audit until it finds no remaining instance or [iteration budget] ends. Stop on blocked or approval-gated work. Return the issues, fixes, evidence, and blockers.
```

## Notes / caveats

**It's only as good as the feedback it can read.** The agent needs access to the
threads where you reported problems — issue tracker, chat history, a pasted dump.
Point it at a real source or it audits from memory. Garbage in, ghost patterns out.

**Set the iteration budget, or it grinds.** "Repeat until clean" on a large project
is open-ended. Cap the passes and the per-pass scope (one service, one surface) so a
noisy week doesn't become an all-night re-scan. Let it report the overflow rather
than chasing it.

**Pairs with the production error sweep.** That loop hunts errors your *logs* surface;
this one hunts patterns your *users* surface. Run this after a release shakes out a
cluster of complaints — it generalizes the one bug you were told about into the ten
you weren't.

**When NOT to use it.** Skip it for one-off cosmetic gripes (no pattern to generalize)
and for feedback that needs product judgment rather than a code fix — the agent will
either find no pattern or open low-value PRs against subjective calls.
