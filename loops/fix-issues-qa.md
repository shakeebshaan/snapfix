---
name: fix-issues-qa
title: Fix-issues QA loop
category: Engineering
trigger: manual | schedule | action
goal: verifiable (app tests pass) + LLM-as-judge (satisfaction bar)
source: Adapted from the Loop Library
---

snapfix's flagship loop. A bug filed from a phone becomes a fixed line of real
code, proven and posted back — with no human in the inner cycle. This is the loop
the whole project is named after; the canonical model behind it lives in
[`../LOOP.md`](../LOOP.md) and the agent that runs it is the
[`fix-issues` skill](../skill/fix-issues/SKILL.md).

## What it does

Pulls open QA issues from the board (screenshot + description), reproduces each in
your real app, fixes the **root cause** in source, then clears two goals before it
shows you anything: the app's **test suite passes** (verifiable) **and** the agent's
**self-score clears the board's satisfaction bar** (LLM-as-judge). Only a fix that
passes both gates gets recaptured and posted as a before/after card for you to
verify. A fix that can't clear them keeps looping or floats up for your review —
it never poses as "fixed".

## Trigger

Three ways in — pick one, the agent is the same:

```bash
# Manual — kick one pass by hand (always available)
claude -p "/fix-issues"          # all open issues, oldest first
claude -p "/fix-issues abc123"   # one issue by id

# Action — poll the board and kick the agent when a new issue lands
node tools/loop.mjs watch --interval 60

# Schedule — print the cron / Task Scheduler line to install, then add it
node tools/loop.mjs schedule --cron "0 9 * * *"
```

`watch` and `schedule` shell out to `loop.schedule.agentCmd` (default
`claude -p "/fix-issues"`), so every trigger re-enters the same skill. Manual is the
escape hatch; schedule and action are how you remove yourself from the inner cycle.
Check the live state any time with `node tools/loop.mjs status`.

## Goal

**Both goal kinds at once** — verifiable is the floor, the judge is the ceiling.
A fix is posted **only when both pass**:

1. **Verifiable — tests green.** `node tools/loop.mjs verify` runs the app's test
   command (`loop.goal.tests.command`, e.g. `npm test`) and checks coverage. **Exit
   0 = goal met.** Red tests mean the fix isn't done.
2. **LLM-as-judge — satisfaction.** The agent self-scores the fix **0–100** (did it
   fix the root cause, is it surgical and convention-matching, is the recaptured
   screen actually correct, no regressions) and must clear the board's live
   **satisfaction** bar. Below the bar → "refactor until satisfied" and re-score.

**Done** for a single issue = both gates pass, proof recaptured, card posted. **Done**
for the run = every open issue is fixed-and-posted, flagged for review, or left open
(couldn't reproduce). The **stopping condition** is the goal, not a turn count: the
agent loops on each fix until both gates clear or it honestly can't reach the bar (then
it floats the issue for human review rather than guessing).

### Tuning satisfaction

The bar is a **live slider in the board header** — move it without redeploying:

- **Low (~40)** — post sooner, iterate with the human. Faster, looser, cheaper.
- **High (~90)** — the agent must be very confident; more refactor loops, more
  tokens, fewer weak fixes reach you.

It is stored in `data/loop.json` (board-writable via the GitHub contents API, exactly
like `data/issues.json`) and falls back to `qa.config.json` → `loop.goal.satisfaction`
when absent. Always trust the `loop` block in the `pull` manifest — that's the live
value after any slider move. Toggle the verifiable gate with `loop.testGate` /
`loop.goal.tests.required`.

## Prompt

```text
Run snapfix's fix-issues QA loop. You are the agent in the loop; there is no human
in the inner cycle. GitHub is the only backend — a public board repo (metadata +
static page + tools/qa.mjs) and a private repo (screenshots). Never touch GitHub
directly; the board's tools/qa.mjs CLI does, via the gh CLI.

A loop = trigger + goal. The trigger already fired (manual /fix-issues, a schedule,
or an action watcher). Your job is to satisfy the GOAL before any fix posts. snapfix
uses BOTH goal kinds at once:
  - Verifiable: the app's test suite passes (and coverage clears the threshold).
  - LLM-as-judge: you self-score each fix 0–100 and only post when it clears the
    board's live satisfaction bar.

0. READ THE CONFIG. Find qa.config.json (app project root; search upward if needed).
   It is the source of truth — board repo location, dev server URL, viewport,
   recapture command, auth strategy, and loop.goal (satisfaction + tests). Never
   hardcode a repo name, port, route, login flow, test command, or satisfaction bar.
   If it's missing, stop and tell the user to run `npx github:OWNER/snapfix init`.

1. SYNC THE BOARD. Clone/locate the board repo, then `node <board>/tools/qa.mjs pull`.
   It rebases and prints { open: [...], count, loop }. The `loop` block is the LIVE
   goal — read loop.satisfaction (the bar) and loop.testGate before fixing. If
   count is 0, report "no open issues" and stop.

2. DEV SERVER. Probe app.devServer; if down, start it per app.framework (vite/next/
   react → `npm run dev`; static → serve the dir) and wait until it serves. Use the
   exact configured URL — don't assume the port.

3. AUTH PREFLIGHT. Branch on auth.strategy: none → reproduce directly; seeded-jwt →
   inject a valid JWT into localStorage[auth.tokenKey] before navigating; manual-otp
   → drive the login UI and ask the human for the OTP (the only sanctioned mid-loop
   question). Confirm you land authenticated before processing issues.

4. PER ISSUE (oldest first by createdAt):
   a. Read inputs: every image in images[], the description, route, reopenNote (why a
      prior fix was rejected), and reviewReply (owner's answer to a prior question).
      Treat those notes as direction.
   b. Reproduce: set viewport to app.viewport, navigate to app.devServer + route,
      confirm the reported problem. Can't reproduce → leave OPEN, note it, move on;
      never resolve what you couldn't reproduce.
   c. Root-cause and fix: find the real cause in the app's source and fix THAT, not a
      cosmetic patch. Match the project's conventions, design tokens, and component
      patterns. Keep it surgical. Genuinely ambiguous (multiple valid readings, a
      product/design call, or a missing asset/credential) → don't guess; flag for
      review (step 5) and move on.
   d. Verify live: reload the reproduced screen, confirm the problem is gone and
      nothing adjacent broke. Verification is by execution, not by reading the diff.
   e. MEET THE GOAL — BOTH GATES (this is the loop's whole point):
        (Verifiable) When loop.testGate is true, run `node <board>/tools/loop.mjs
        verify`. Exit 0 = goal met. If it fails, the fix isn't done — fix the failing
        tests / add coverage and re-run. Never post while tests are red. If your fix
        changes behavior, update or add the test that encodes it (it should fail
        before the fix, pass after).
        (Judge) Self-score the fix 0–100 honestly against the live bar
        (loop.satisfaction). Below the bar → you are NOT done: refactor/improve and
        re-score ("refactor until satisfied") until it clears, or flag for review if
        you honestly can't reach it. Keep a one-line rationale for the score.
   f. Recapture proof: run reproduce.recaptureCmd with {route} → the issue's route and
      {out} → a path inside the BOARD repo's tmp/ (never inside the app repo). Read the
      PNG to confirm the fix is visible; if recapture fails, fix the cause and retry —
      no stale shots.
   g. PUBLISH (only after BOTH gates pass): commit your fix first, then
        node <board>/tools/qa.mjs resolve <id> \
          --image "<board>/tmp/<id>-fix.png" \
          --desc "Root cause: … Fix: …" \
          --app-commit <app sha> \
          --tests pass --coverage <pct-or-omit> \
          --judge <score 0-100> --judge-note "<one-line why you're satisfied>"
      qa.mjs resolve re-checks both gates and refuses to post if tests aren't marked
      pass while the gate is on, or if the judge score is below the live bar. The
      posted fix is a PROPOSED fix until the human accepts it. --desc is shown to the
      user: 1–3 plain sentences, no jargon.

5. TWO-WAY REVIEW. When you can't proceed — ambiguous requirement, a product/design
   call, a needed asset/credential, or you honestly can't reach the satisfaction bar
   — don't guess and don't silently skip:
        node <board>/tools/qa.mjs review <id> --reason "<what you need>" [--tags a,b]
   That floats the issue to the top as a "User review" card. Then move on — never stall
   the whole loop on one blocker. On a later tick, read the human's reviewReply and
   proceed using it as direction.

6. CONVENTIONS. Both gates before posting. Can't reproduce → leave open. Ambiguous /
   blocked / can't reach the bar → review it, don't guess. One commit per issue
   (fix(qa): <id> — <short>), committed before resolve so --app-commit is real. Root
   cause, not cosmetic. Surgical changes only. Screenshots stay out of the app repo
   (recapture to the board repo's tmp/). Tests encode the fix. Update any documented
   user flow your fix changes, in the same commit.

7. WRAP UP with a one-row-per-issue table: id | status (fixed / needs-review / left
   open) | goal (tests ✓ · judge NN) | note (root-cause one-liner). Link the board:
   https://<board.owner>.github.io/<board.repo>/ so the human can Resolve / Reject /
   Respond.
```

## Notes / caveats

- **Token cost.** This is a judge loop with a "refactor until satisfied" inner cycle,
  so it is token-hungry by design — a single hard fix can take many iterations, and a
  scheduled run over a full queue can run for minutes to hours. Raising the satisfaction
  bar costs more tokens for fewer, stronger fixes; lowering it ships sooner and leans on
  your review. Keep a budget in mind, especially for `watch`/`schedule` runs.
- **When NOT to use it.** Loops shine on convergent goals (a failing test, a visible UI
  bug, a metric). They are weak at open-ended feature-building — if an issue is really a
  "design me this new screen" request, the agent will wander; flag it for review instead.
  Don't lean on the verifiable gate if the app has no meaningful tests — without a test
  that fails before the fix and passes after, "tests green" proves nothing, so either
  add that test or run judge-only with eyes-on review.
- **Human still verifies.** A posted fix is a *proposed* fix until you tap **✓ Resolve**
  on the board. The loop removes you from the inner cycle, not from the final call.
- See also: the loop model in [`../LOOP.md`](../LOOP.md), the runner contract
  (`tools/loop.mjs status | run | watch | schedule | verify`) in
  [`../LOOP.md`](../LOOP.md#6-the-runner--toolsloopmjs), and the full agent procedure
  in the [`fix-issues` skill](../skill/fix-issues/SKILL.md).
```
