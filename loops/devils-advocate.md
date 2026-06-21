---
name: devils-advocate
title: Devil's advocate
category: Design
trigger: manual (before committing to a design/architecture/rollout)
goal: LLM-as-judge — no high-impact objection remains, or the same issues repeat two rounds with no new evidence
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/devils-advocate-design-loop/
---

## What it does

A critic-and-builder workflow that attacks a design, tracks every objection, and requires
evidence before an objection can be closed. Before committing to an architecture,
interface, or rollout plan, a critic argues that it is wrong and logs each objection — its
impact and status — to a repository-local file at `.agent-reviews/redteam.md`. The builder
must **fix and verify each high-impact weakness or document why it is accepted**, and the
critic may **reopen any answer that isn't supported by evidence**. It stops when no
high-impact objection remains, or the same issues repeat for two rounds without new
evidence (a stalemate).

## Trigger

Manual, run before you commit to a consequential design. Paste the prompt into a CLI agent:

```bash
claude -p "Before committing to an architecture, interface, or rollout plan, have a critic argue that it is wrong. Record each objection, impact, and status in a repository-local log at .agent-reviews/redteam.md. The builder must fix and verify each high-impact weakness or document why it is accepted; the critic may reopen unsupported answers. Stop when no high-impact objection remains or the same issues repeat for two rounds without new evidence. Finish with the decision, resolved and accepted objections, evidence, and any stalemate."
```

## Goal

**LLM-as-judge.** "Done" means: no high-impact objection remains open in
`.agent-reviews/redteam.md` — every one is either fixed-and-verified or explicitly
accepted with a documented reason — *or* the loop detects a stalemate (the same issues
recur for two rounds without new evidence) and stops. The judge is adversarial by design:
the critic, not the builder, decides whether an answer holds, and it can reopen anything
that isn't backed by evidence.

## Prompt

```text
Before committing to an architecture, interface, or rollout plan, have a critic argue that it is wrong. Record each objection, impact, and status in a repository-local log at .agent-reviews/redteam.md. The builder must fix and verify each high-impact weakness or document why it is accepted; the critic may reopen unsupported answers. Stop when no high-impact objection remains or the same issues repeat for two rounds without new evidence. Finish with the decision, resolved and accepted objections, evidence, and any stalemate.
```

## Notes / caveats

**The objection log is the loop's memory.** `.agent-reviews/redteam.md` is what makes this
auditable — every objection, its impact, and its status live there across rounds. Commit
it (or at least review it); without the log you lose the evidence trail and the critic
can't tell a closed objection from a forgotten one.

**"Evidence" needs teeth or the critic rubber-stamps.** This is pure LLM-as-judge — the
critic deciding whether a rebuttal holds. Define what counts as evidence up front (a
passing test, a benchmark number, a cited constraint) so "verified" means more than the
builder asserting it. Vague evidence rules turn an adversarial review into mutual
agreement.

**The stalemate exit prevents an infinite argument.** Two rounds of the same objections
with no new evidence ends the loop on purpose — that's a signal for a human to break the
tie, not a failure. Surface stalemates rather than letting the critic and builder grind.

**When NOT to use it.** This reviews a decision; it doesn't make one. Skip it for
low-stakes, easily-reversible changes (the ceremony costs more than the risk), and don't
treat its output as approval — a human still owns the commit-or-not call.
