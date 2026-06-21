# snapfix is a loop

> **A loop lets an AI coding agent work autonomously toward a goal — removing the
> human from the inner cycle so the agent moves fast.** snapfix's screenshot-to-AI-fix
> QA board is one concrete loop (the **fix-issues loop**), built on a general loop
> model. This document is the source of truth for that model. The reusable catalog
> lives in [`loops/`](loops/) — the **Loop Library**.

Concept credit: the loop framing (trigger + goal, verifiable vs. LLM-as-judge) is from
Forward Future's [Loop Library](https://signals.forwardfuture.ai/loop-library/). This
project bakes that framing into a runnable, GitHub-backed, multi-user system.

---

## 1. What a loop is

A loop needs exactly two things:

```
loop = trigger + goal
       │         └── what "done" means; the agent repeats until it's met
       └── what kicks the loop off
```

The agent does work, checks the goal, and **repeats until the goal is met** — no human
in the inner cycle. The human sets the trigger and the goal, then reviews the result.

### 1.1 Trigger — how the loop starts

| Trigger | Meaning | In snapfix |
| --- | --- | --- |
| **Manual** | A human kicks it off once. | `/fix-issues` in Claude Code (always available). |
| **Schedule** | Runs at a time / on a repeating schedule. | `loop.mjs schedule` installs an OS scheduler (cron / Task Scheduler) or a Claude Code routine that runs the agent command. |
| **Action** | Fires on an event (new issue filed, PR opened). | `loop.mjs watch` polls the board for new open issues (or the app repo for new PRs) and kicks the agent when work appears. |

snapfix's triggers are **local & self-paced** — bring-your-own-agent, **zero cloud
secrets**. The agent command is configurable (`loop.schedule.agentCmd`, default
`claude -p "/fix-issues"`), so you can point it at any CLI agent. To fully remove the
human you lean on schedule/action; manual is the escape hatch.

### 1.2 Goal — how the agent knows it's done

Two kinds, straight from the Loop Library:

| Goal kind | Definition | snapfix example |
| --- | --- | --- |
| **Verifiable** | A deterministic check — a number, a passing test suite, a metric. Unambiguous. | The app's **test suite passes** and **coverage ≥ threshold** before a fix may be posted. |
| **LLM-as-judge** | The model decides when the goal is met ("refactor until satisfied"). Brittle by nature — taste is delegated to the model. | The agent **self-scores each fix 0–100** and refactors until the score clears the **satisfaction threshold**. |

snapfix's fix-issues loop uses **both at once**: a fix is only posted to the board when
it is *verifiable* (tests green, coverage met) **and** *judged* (self-score ≥
satisfaction). Verifiable is the floor; the judge is the ceiling.

> **Caveat (from the Loop Library):** loops shine on convergent goals (a metric, a test,
> a cleanup). They are weak at open-ended feature-building — the agent can wander. And
> they are **token-hungry**: a loop runs until the goal is met, which can be minutes or
> hours. Keep a budget in mind, especially for judge loops.

### 1.3 Expressing the stop — the `/goal` command

A loop only works if the agent knows when to stop. Two CLI agents make that explicit with
a **`/goal`** command — **Codex** and **Claude Code** both support it: prefix your prompt
with `/goal` and the agent keeps working autonomously until the stated condition is met,
instead of stopping after a single pass. It is the manual trigger and the stopping
condition in one move:

```text
/goal Look for more optimizations until every page loads under 50ms in production.
```

snapfix's project-native equivalent of `/goal` is the **dual gate**: `tools/loop.mjs verify`
(the verifiable stop) plus the skill's self-score against `satisfaction` (the judge stop).
`/goal` expresses the stop at the *agent* level for a one-off manual run; `loop.mjs`
expresses it at the *repo* level, so the same loop can also run scheduled or unattended.

---

## 2. snapfix's fix-issues loop

```
TRIGGER (manual | schedule | action)
   │
   ▼
pull open issues ──► reproduce ──► root-cause fix ──► recapture proof
   │                                                        │
   │                          ┌─────────────────────────────┤
   │                          ▼                             ▼
   │                   VERIFIABLE GOAL              LLM-AS-JUDGE GOAL
   │                   run app tests +              self-score the fix 0–100
   │                   check coverage               against `satisfaction`
   │                          │                             │
   │              tests fail ◄┘            score < bar ──► refactor & re-score
   │              → keep fixing                              │ (loop)
   │                          └──────────┬──────────────────┘
   │                                     ▼  both pass
   │                              POST fix to board (attributed to the agent's GitHub login)
   │                                     │
   └──────────── human verifies: ✓ Resolve · ✗ Not fixed (re-fix) · ↩ Respond
```

The verifiable gate and the judge gate both sit **before** the fix is posted. A fix that
can't clear them is never shown as a "proposed fix" — the agent either keeps looping or
flags the issue for human review.

---

## 3. The satisfaction knob

`satisfaction` is the LLM-as-judge threshold (0–100) the fix must reach before it's
posted. It is **adjustable live from the board** (a slider in the board header) so the
owner can tune strictness without redeploying:

- **Low (e.g. 40)** — post sooner, iterate with the human. Faster, looser.
- **High (e.g. 90)** — the agent must be very confident; more refactor loops, more
  tokens, fewer weak fixes reach you.

It is stored in **`data/loop.json`** in the board repo (browser-writable via the GitHub
contents API, exactly like `data/issues.json`). The skill and `loop.mjs` read it there,
falling back to `qa.config.json` → `loop.goal.satisfaction` when the file is absent.

```jsonc
// data/loop.json — live loop settings, board-adjustable
{
  "version": 1,
  "satisfaction": 80,     // 0–100 LLM-judge bar a fix must clear to post
  "testGate": true,       // require the app test suite to pass before posting
  "updatedAt": "…",
  "updatedBy": "octocat"  // GitHub login of whoever moved the slider
}
```

---

## 4. Multi-user — everyone uses their own GitHub token

The board is **GitHub all the way down**, so it is multi-user for free: anyone with a
fine-grained PAT that has Contents R/W on the two repos can file, fix, and review.
snapfix makes that *legible* by attributing every action to its GitHub identity:

- On connect, the board reads the token's `login` (`GET /user`) — that's the actor.
- **Filing** stamps `author` (login) on the issue.
- **Resolve / Not-fixed / Respond** stamp `by` on the history event and on the fix.
- `qa.mjs` auto-detects the agent's identity (`gh api user --jq .login`) so CLI/agent
  actions are attributed too.
- The board renders the actor (login + avatar) on each card: *filed by X*, *resolved by
  Y*, *answered by Z*.

No central user table, no server — identity rides on each user's own token. That is what
"full multi-user past their GitHub tokens" means here.

---

## 5. The config surface

Everything loop-related is config-driven (same philosophy as the rest of snapfix). Static
loop config lives in `qa.config.json`; the live knob lives in `data/loop.json`.

```jsonc
// qa.config.json → new `loop` section
"loop": {
  "trigger": "manual",                       // manual | schedule | action
  "schedule": {
    "cron": "0 9 * * *",                     // when (schedule trigger)
    "agentCmd": "claude -p \"/fix-issues\""  // the agent invocation the runner shells out to
  },
  "action": { "on": "new-issue", "pollSeconds": 60 },  // event + poll cadence (action trigger)
  "goal": {
    "satisfaction": 80,                      // default judge bar (board overrides via data/loop.json)
    "tests": { "required": true, "command": "npm test", "coverage": 100 }
  }
}
```

| Key | Meaning |
| --- | --- |
| `loop.trigger` | Which trigger this board's fix loop uses by default. |
| `loop.schedule.cron` / `agentCmd` | Schedule cadence and the agent command the runner invokes. |
| `loop.action.on` / `pollSeconds` | Event the action trigger watches for, and how often it polls. |
| `loop.goal.satisfaction` | Default LLM-judge bar (0–100); `data/loop.json` overrides it live. |
| `loop.goal.tests.required` | Whether the verifiable test gate is enforced before posting. |
| `loop.goal.tests.command` | The app's test command the runner/skill executes. |
| `loop.goal.tests.coverage` | Minimum coverage %% required (0 disables the coverage check). |

---

## 6. The runner — `tools/loop.mjs`

A zero-dep Node CLI (git + your agent CLI only) that turns the config above into the
three triggers. It never fixes code itself — it **orchestrates the agent** that does.

```
node tools/loop.mjs status            # loop config, open count, satisfaction, last run
node tools/loop.mjs run               # one tick: invoke the agent command once
node tools/loop.mjs watch [--interval 60]  # action/schedule: poll for work, kick the agent, repeat
node tools/loop.mjs schedule [--cron "0 9 * * *"]  # print the OS-scheduler line to install
node tools/loop.mjs verify            # run the verifiable gate (tests + coverage); exit 0 = goal met
```

`verify` is the shared verifiable check — the skill calls it before posting, `watch`
calls it as the stopping condition, and CI can call it too.

---

## 7. The Loop Library

[`loops/`](loops/) is a catalog of reusable loop definitions ported from the Loop
Library plus snapfix's own. Each entry is a markdown file with a uniform front-matter
(trigger, goal kind, category) and a copy-pasteable prompt. The fix-issues loop is the
flagship; the rest are templates you can drop into any project. See
[`loops/README.md`](loops/README.md) for the index.
