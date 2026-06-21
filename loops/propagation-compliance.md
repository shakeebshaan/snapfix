---
name: propagation-compliance
title: Propagation compliance
category: Engineering
trigger: action (fires after you change a value that appears in many files)
goal: verifiable — zero unintended copies of the old value remain; every match is intentional
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/propagation-compliance-loop/
---

## What it does

Keeps a changed value consistent across a whole project. When you change a version number, count, rule, name, setting, or identifier that appears in several files, the agent lists where the new value belongs and updates it, then searches the project for the old value and related forms. It reviews every match: fixing real stale copies while preserving intentional ones — history, examples, migrations, compatibility rules. It repeats until zero stale values remain. If a stale value keeps coming back across two rounds, it stops and identifies what's regenerating it (a build step, a generator, a template) rather than fighting the symptom forever.

## Trigger

Action-triggered — it fires after you make a change that propagates. Point the runner at your repo and let it kick the agent when a tracked value changes:

```bash
node tools/loop.mjs watch --interval 30
```

The runner polls for the change and shells out to your configured `agentCmd`. You can also run it as a one-shot right after an edit with `node tools/loop.mjs run`.

## Goal

**Verifiable (search).** "Done" means: a project-wide search for the old value (and its related forms) returns zero *unintended* matches — every remaining hit is documented as intentional: historical record, example, migration, or compatibility rule. The agent returns the changes it made, the intentional matches it kept, and the raw search output as proof. The search result *is* the verification — empty of stale copies, or fully explained.

## Prompt

```text
After changing a version, count, rule, name, or configuration, list where the new value belongs and update it. Search the project for the old value and related forms. Review each match: fix real stale values, but keep intentional history, examples, migrations, or compatibility rules. Repeat until zero stale values remain. If one returns for two rounds, stop and identify what may be regenerating it. Return changes, intentional matches, and search output.
```

## Notes / caveats

**"Related forms" is the part naive search-and-replace misses.** A version bump isn't just `1.2.0` → `1.3.0`; it's `v1.2.0`, `1_2_0`, `120`, the value embedded in a URL or a constant name. The loop's value is catching those variants — but it also means a blind replace is dangerous, which is exactly why every match gets *reviewed*, not auto-swapped.

**Intentional matches are the trap — don't let it "fix" history.** Changelogs, migration scripts, test fixtures, and back-compat shims legitimately contain the old value. The loop is judged on telling stale from intentional; if it rewrites a migration that documents the old schema, it's done harm. Skim the kept-matches list, not just the changed ones.

**The two-round regeneration check is the real insight.** If a stale value reappears, something is *generating* it — a codegen step, a cached artifact, a template. The loop is told to stop and name the source rather than loop forever patching output. Honor that: fix the generator, not the generated file.

**When NOT to use it.** Skip it for a one-off value that lives in a single file (just edit it), and skip it where the "old value" is too generic to search safely (a bare `1` or `true`) — you'll drown in false matches. Pairs well as a follow-up to any loop that bumps a version or renames something.
