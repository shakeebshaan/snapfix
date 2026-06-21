---
name: axelrod-subagent-arena
title: Axelrod subagent arena
category: Evaluation
trigger: manual (run when you want a head-to-head agent benchmark)
goal: verifiable — all 18 matches and 180 rounds complete and fully reproducible from the record
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/axelrod-subagent-arena-loop/
---

## What it does

Runs a fixed Axelrod tournament — iterated Prisoner's Dilemma — to benchmark two
reasoning agents against each other under controlled, reproducible conditions. Each
round both players privately pick cooperate (C) or defect (D); code records the
simultaneous moves and applies fixed scoring (mutual C = 3/3, defection = 5/0, mutual
D = 1/1). Two scripted baselines — always-cooperate and always-defect — round out the
field. The structure is fixed: three cycles, six pairings per cycle, ten rounds per
pairing — 18 matches, 180 rounds. Opponent type and private reasoning stay hidden.
The loop validates every move, recomputes totals from history, and reports rankings
by raw score and cooperation-stability alongside reasoning summaries and any rule
violations.

## Trigger

Manual. Kick it off when you want a data-backed head-to-head rather than a vibe check
on which agent reasons better under repeated strategic pressure:

```bash
claude -p "Run a fixed Axelrod tournament with two reasoning AI agents. Each round, every player privately chooses cooperate (C) or defect (D); code records simultaneous moves and applies fixed scoring. Include always-defect and always-cooperate comparison players. Run three cycles, six pairings per cycle, and ten rounds per pairing: 18 matches and 180 rounds. Hide opponent type and private reasoning. Validate every move and total. Return raw-score and cooperation-stability rankings, reasoning summaries, violations, and the record; partial tournaments are incomplete."
```

## Goal

**Verifiable (tournament).** "Done" means all 18 matches and 180 rounds are complete
and the final standings can be recomputed exactly from the recorded moves — a partial
tournament is, by the prompt's own rule, *incomplete*. Two sub-checks gate it:

- **Every move and total validated.** Each choice is a legal C/D and each score is
  recomputed from history, not trusted from a running tally — a hallucinated move or
  arithmetic slip invalidates the run.
- **Full reproducibility from the record.** The move log alone must regenerate the
  rankings. If it can't, the result isn't a baseline you can defend.

## Prompt

```text
Run a fixed Axelrod tournament with two reasoning AI agents. Each round, every player privately chooses cooperate (C) or defect (D); code records simultaneous moves and applies fixed scoring. Include always-defect and always-cooperate comparison players. Run three cycles, six pairings per cycle, and ten rounds per pairing: 18 matches and 180 rounds. Hide opponent type and private reasoning. Validate every move and total. Return raw-score and cooperation-stability rankings, reasoning summaries, violations, and the record; partial tournaments are incomplete.
```

## Notes / caveats

**The code is the referee, not the model.** Scoring, move recording, and totals must
live in deterministic code — if the agent self-reports its own scores you've measured
its honesty, not its strategy. Keep the harness dumb and the players blind.

**Token cost scales with rounds and reasoning.** 180 rounds times two reasoning agents,
each thinking before every move, is not cheap. It's a bounded one-shot, not a
schedule — run it deliberately when you have a question worth the spend, not as a
background habit.

**Hidden information is load-bearing.** Leak the opponent's type or private reasoning
and the benchmark is meaningless — players would meta-game the scripted baselines.
Audit the prompts each player sees before trusting a result.

**When NOT to use it.** This measures repeated strategic cooperation/defection, not
general capability. Don't read tournament rank as "better agent" for tasks that look
nothing like iterated PD — it's a narrow, specific probe.
