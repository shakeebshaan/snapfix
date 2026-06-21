---
name: autonomy-builder-reviewer
title: Autonomy builder-reviewer
category: Engineering
trigger: manual (run after gates pass, on a task suited to repeated handoffs)
goal: verifiable (tests) — every accepted wave passes the proof-of-test gate
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/autonomy-loop/
---

## What it does

A two-role loop: a builder and an adversarial reviewer work in separate git worktrees and
hand off through a `LOOP-STATE.md` file. The builder reads the state, makes one bounded
change, and adds a test that's red before the change and green after. The reviewer reruns
the test/build/lint gates and *proves* the test by reverting or mutating the fix to confirm
the test actually fails without it. Work advances only when both pass; protected production
changes or repeated failures are parked for a human. Each accepted wave finishes with the
commit, gate evidence, test proof, a trust tier, and risks.

## Trigger

Manual. Run it on a repo that already has deterministic test, build, and lint gates and a
task that suits repeated builder/reviewer handoffs. It uses a setup step
(`/autonomy-loop:autonomy-init`) before the two roles start in their worktrees. Use any
CLI agent:

```text
claude -p "/autonomy-builder-reviewer"
```

Or as a one-shot tick through the snapfix runner, overriding the agent command for this loop:

```text
node tools/loop.mjs run --agent 'claude -p "Use autonomy-loop for [repository task] after the test, build, and lint gates pass. Run /autonomy-loop:autonomy-init, then start builder and reviewer in separate worktrees. The builder reads LOOP-STATE.md, makes one bounded change, and adds a red-before, green-after test. The reviewer reruns the gates and proves the test by reverting or mutating the fix. Accept only on both passes; park protected or repeated-failure work for a human. Finish with the commit, gate evidence, test proof, trust tier, and risks."'
```

## Goal

**Verifiable (tests).** "Done" / accepted means: every accepted wave passes the
proof-of-test gate — the new test fails without the change and passes with it, and the
test, build, and lint gates are all green. The reviewer's revert-or-mutate check is the
gate: a test that still passes after the fix is reverted proves nothing and the wave is
rejected. Protected or repeatedly-failing work is escalated to a human rather than forced
through.

## Prompt

```text
Use autonomy-loop for [repository task] after the test, build, and lint gates pass. Run /autonomy-loop:autonomy-init, then start builder and reviewer in separate worktrees. The builder reads LOOP-STATE.md, makes one bounded change, and adds a red-before, green-after test. The reviewer reruns the gates and proves the test by reverting or mutating the fix. Accept only on both passes; park protected or repeated-failure work for a human. Finish with the commit, gate evidence, test proof, trust tier, and risks.
```

## Notes / caveats

**Deterministic gates are a hard prerequisite.** The entire loop rests on test/build/lint
being reproducible. Flaky gates poison both roles — stabilize the suite first (see the
test stabilizer loop) or the reviewer can't trust its own re-runs.

**Proof-of-test is the real safeguard, not just "tests pass."** The revert-or-mutate step
is what separates this from a normal agent: it confirms the test would actually catch the
bug. Don't let a wave through on green tests alone if the proof step was skipped.

**Local hooks are tripwires, not security.** Pre-commit/CI hooks here flag problems; they
are not an authorization boundary. Protected production changes stay human-gated regardless
of what the hooks allow — keep a person on those.

**Resumable, and worktree-aware.** State lives in `LOOP-STATE.md`, so the loop can be
paused and picked back up. On Windows, confirm `git worktree` is available and your gate
commands run cross-shell before trusting an unattended run. When NOT to use: tasks needing
product judgment per step, or repos without a clean gate suite.
