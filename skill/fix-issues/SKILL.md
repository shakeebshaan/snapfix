---
name: fix-issues
description: Fetch open QA issues from the snapfix board, fix each in the app, run the verifiable test gate, self-score against the satisfaction bar (LLM-as-judge), recapture proof, and publish. Use when asked to "fix issues", "fix the QA issues", or "run the loop".
user-invocable: true
argument-hint: "[issue id (optional — default: all open)]"
---

# Fix QA Issues Loop

This is the snapfix automation — **a loop** (see `LOOP.md`). Filed QA issues
(screenshot + description, posted from the board) come in; you reproduce each in the
real app, fix the **root cause** in the app's source, prove the fix clears the loop's
**goal**, recapture proof, and publish a before/after card back to the board. GitHub is
the only backend — a public board repo (metadata + static page) and a private repo
(screenshots). You never touch GitHub directly; the board's `tools/qa.mjs` CLI does, via
the `gh` CLI.

**A loop = trigger + goal.** The *trigger* kicked you off (manual `/fix-issues`, a
schedule, or an action watcher — see §8). The *goal* is what you must satisfy before a
fix may post. snapfix uses **both goal kinds at once**:

- **Verifiable** — the app's **test suite passes** (and coverage clears the threshold).
- **LLM-as-judge** — you **self-score each fix 0–100** and only post when the score
  clears the board's **satisfaction bar**.

Each issue has a LEFT side (the user's screenshot + description) and a RIGHT side you
populate (the fixed screenshot, the root-cause/fix note, and the goal proof).

> **Everything project-specific lives in `qa.config.json`.** This skill is generic. Read
> that file first and drive every step from it — board repo location, dev server URL,
> viewport, recapture command, auth strategy, and the loop's goal. Never hardcode a repo
> name, port, route, login flow, test command, or satisfaction bar.

If an issue id was passed as the argument, operate on that single issue. Otherwise
process **all open issues, oldest first**.

---

## 0. Read the config

Find `qa.config.json` (project root of the app — the current working directory, or
search upward if not found). Parse it once; refer back to these keys throughout:

```json
{
  "board":     { "owner": "USER", "repo": "myapp-qa", "private": "myapp-qa-private", "branch": "main" },
  "app":       { "repo": ".", "devServer": "http://localhost:5173", "viewport": "390x844", "framework": "vite" },
  "reproduce": { "tool": "playwright", "recaptureCmd": "node recapture.mjs {route} {out}" },
  "auth":      { "strategy": "none", "tokenKey": "access_token", "loginUrl": "/" },
  "loop":      { "trigger": "manual",
                 "goal": { "satisfaction": 80, "tests": { "required": true, "command": "npm test", "coverage": 0 } } }
}
```

| Key | Used for |
| --- | --- |
| `board.owner` / `board.repo` / `board.branch` | locate / clone the board repo (the public one with `tools/qa.mjs` + `data/issues.json`) |
| `board.private` | private image store (the CLI uploads/downloads here — you don't touch it directly) |
| `app.devServer` | the URL to probe / start and to reproduce against |
| `app.viewport` | the `WIDTHxHEIGHT` to set in the browser before reproducing/recapturing |
| `app.framework` | how to start the dev server if it's down (e.g. `vite` → `npm run dev`) |
| `reproduce.recaptureCmd` | the command to capture proof; `{route}` and `{out}` are substituted |
| `auth.strategy` | `none` \| `seeded-jwt` \| `manual-otp` — how to get an authenticated session |
| `loop.goal.satisfaction` | the **default** LLM-as-judge bar (0–100). The **live** bar comes from the `pull` manifest (`loop.satisfaction`) — the board's slider can move it; trust the manifest value. |
| `loop.goal.tests` | the **verifiable** gate: `required` (enforce it), `command` (the app's test command), `coverage` (minimum %, 0 disables) |

If `qa.config.json` is missing, stop and tell the user to run `npx github:OWNER/snapfix init`.

---

## 1. Sync the board

Locate the board repo (a sibling checkout of `board.repo`, or clone it):

```
gh repo clone <board.owner>/<board.repo> <local board path>
```

Then pull the open issues as a manifest:

```
node <board path>/tools/qa.mjs pull
```

`pull` rebases the board repo, then prints JSON: `{ open: [...], count, loop }`. The
`loop` block is **the live goal** — read it before you start fixing:

```jsonc
{
  "open": [ {
    "id": "...", "createdAt": "...", "route": "/some/route", "description": "...",
    "imagePrivate": true, "image": "<abs path>", "images": ["<abs path>", ...],
    "reopenNote": "...|null", "needsReview": false, "reviewReason": "...|null",
    "reviewReply": "...|null", "reviewReplyImages": ["<abs path>", ...],
    "author": "octocat|null", "tags": ["..."]|null
  } ],
  "count": 1,
  "loop": { "satisfaction": 80, "testGate": true, "testCommand": "npm test", "coverage": 0 }
}
```

`loop.satisfaction` is the **bar a fix must reach to post**; `loop.testGate` says whether
tests are required. If `count` is 0 → report "no open issues" and stop.

---

## 2. Dev server

Probe `app.devServer` (HTTP GET). If it's not up, start it in the background and wait
until it serves, then continue. Start command by `app.framework`:

| `app.framework` | start command |
| --- | --- |
| `vite` / `next` / `react` / `vue` / `sveltekit` / `angular` | `npm run dev` (in `app.repo`) |
| `static` | serve the directory (e.g. `npx serve`) |
| anything else | the project's documented dev command; if unknown, check `package.json` `scripts.dev` / `scripts.start` |

Use the exact `app.devServer` value — don't assume the port. If it's taken by an
unrelated process, surface that rather than reproducing against the wrong app.

---

## 3. Auth preflight

Branch on `auth.strategy`:

- **`none`** — nothing to do. Reproduce directly.
- **`seeded-jwt`** — obtain a valid JWT and inject it into `localStorage[auth.tokenKey]`
  before navigating. If no valid token is available, set the issue to needs-review (§5)
  explaining the auth blocker rather than guessing.
- **`manual-otp`** — drive the login UI and **ask the human for the OTP** (the only
  sanctioned mid-loop human question). After login the app reuses the session.

Verify you land on an authenticated page before processing issues. If auth fails and
can't be recovered, stop and report.

---

## 4. Per issue (oldest first)

For each issue in the manifest, in `createdAt` order:

1. **Read the inputs.** Read every path in `images[]` and read `description`, `route`,
   `reopenNote` (why a prior fix was rejected) and `reviewReply` (owner's answer to a
   prior needs-review) — including every path in `reviewReplyImages[]`, the
   screenshots the owner attached to that answer. These notes are direction; honor them.

2. **Reproduce.** Set the viewport to `app.viewport`, navigate to `app.devServer` +
   `route`, and confirm the reported problem. If `route` is null/wrong, infer it.
   - **Can't reproduce** → leave the issue **open**, note it in the wrap-up, move on. Do
     **not** resolve an issue you couldn't reproduce.

3. **Root-cause and fix.** Find the real cause in the app's source and fix *that* — not a
   cosmetic patch. Match the project's conventions, design tokens, and component
   patterns. Keep the change surgical.
   - **Genuinely ambiguous** (multiple valid interpretations, a product/design decision,
     or a missing asset/credential) → **don't guess.** Set the issue to needs-review (§5)
     and move on.

4. **Verify live.** Reload the reproduced screen and confirm the problem is gone and
   nothing adjacent broke. Verification is by execution, not by reading the diff.

5. **Meet the loop's goal — BOTH gates (this is the loop's whole point).**

   **(a) Verifiable goal — tests.** When `loop.testGate` is true, run the verifiable
   gate from the app repo:

   ```
   node <board path>/tools/loop.mjs verify
   ```

   It runs `loop.goal.tests.command` and checks coverage. **Exit 0 = goal met.** If it
   fails, the fix isn't done — fix the failing tests / add the missing coverage and
   re-run. Never post a fix while tests are red. (If your fix changes behavior, update or
   add the tests that encode that behavior — a passing suite that doesn't cover the fix
   is not real proof.)

   **(b) LLM-as-judge goal — satisfaction.** Self-score the fix **0–100** against the
   live bar (`loop.satisfaction` from the manifest). Judge honestly on: did it fix the
   **root cause** (not the symptom), is it surgical and convention-matching, is the
   recaptured screen actually correct, did you avoid regressions. **If your score is
   below the bar, you are not done** — refactor/improve and re-score (this is the
   "refactor until satisfied" loop) until the score clears the bar, or flag needs-review
   (§5) if you can't honestly reach it. Keep a one-line rationale for the score.

6. **Recapture proof.** Run `reproduce.recaptureCmd` with `{route}` → the issue's route
   and `{out}` → a path **inside the board repo's `tmp/`** (never inside the app repo):

   ```
   node recapture.mjs <route> "<board path>/tmp/<id>-fix.png"
   ```

   Then **Read the PNG** to confirm the fix is visible. If recapture fails, fix the cause
   and retry — don't publish a stale/unverified shot.

7. **Publish (only after BOTH gates pass).** Commit your fix first (§7), then:

   ```
   node <board path>/tools/qa.mjs resolve <id> \
     --image "<board path>/tmp/<id>-fix.png" \
     --desc "Root cause: … Fix: …" \
     --app-commit <app sha> \
     --tests pass --coverage <pct-or-omit> \
     --judge <your-score 0-100> --judge-note "<one-line why you're satisfied>"
   ```

   - `qa.mjs resolve` **re-checks both gates** and **refuses to post** if `--tests pass`
     is missing while the gate is on, or if `--judge` is below the live satisfaction bar.
     This is a backstop — you should already have met them in step 5.
   - `--image` is repeatable (a multi-screen fix shows shots side-by-side).
   - `--desc` is shown to the user — 1–3 plain sentences: what was wrong, what you
     changed. No jargon dumps.
   - The fix is attributed to your GitHub login automatically (`qa.mjs` reads it from the
     `gh` session) and shows as *fixed by you* on the card.
   - The published fix is a **proposed fix** until the human accepts it (§5).

---

## 5. The two-way review channel (read this carefully)

The board is a conversation, not a one-way dump. Two directions:

**You → human (you're blocked).** When you can't proceed without a human decision —
ambiguous requirement, a product/design call, a needed asset/credential, or **you
honestly can't reach the satisfaction bar** — do not guess and do not silently skip:

```
node <board path>/tools/qa.mjs review <id> --reason "<what you need / why you can't proceed>" [--tags a,b]
```

This floats the issue to the top with a **"User review"** card. Then move on to other
issues — never stall the whole loop on one blocker.

**Human → you (their reply).** The human acts on the card:
- **Respond** → records `reviewReply` (and who replied, and any screenshots they
  attached → `reviewReplyImages`) and clears `needsReview`, putting the issue back in
  the open queue *with their answer*. Next loop tick you read `reviewReply` + view
  `reviewReplyImages` and proceed using them as direction.
- **Resolve** → accepts the current state and moves the issue to the resolved archive.
  This is how a *proposed fix* becomes *done* — not done until the human taps Resolve.
- **Reject** ("not fixed") → back to the open queue with an optional `reopenNote`; the
  prior fix is preserved in `history` (the board's "previous fix" dropdown). Read the
  note, understand why the first attempt missed, and re-fix.

---

## 6. Conventions

- **Both goal gates before posting.** Tests green (verifiable) **and** self-score ≥
  satisfaction (judge). A fix that clears neither is not a fix.
- **Can't reproduce** → leave open, note it, do **not** resolve.
- **Ambiguous / blocked / can't reach the bar** → `review` it (§5) rather than guessing.
- **One commit per issue** (subject like `fix(qa): <id> — <short>`), or one batch commit
  for several fixes. Commit before `resolve` so `--app-commit <sha>` is real.
- **Root cause, not cosmetic.** A patch that hides the symptom is not a fix.
- **Surgical changes.** Don't refactor unrelated code or "improve" adjacent files.
- **Screenshots stay out of the app repo.** Recapture output goes to the board repo's
  `tmp/` only; the CLI moves it to the private image store.
- **Tests encode the fix.** If your fix changes user-facing behavior, the test you rely
  on for the verifiable gate should fail before the fix and pass after.
- **Project flow docs.** If a fix changes a documented user flow, update that doc in the
  same commit.

---

## 7. Wrap-up

End with a summary table — one row per issue:

| id | status | goal | note |
| --- | --- | --- | --- |
| `<id>` | fixed | tests ✓ · judge 88 | root-cause one-liner + board URL |
| `<id>` | needs-review | — | what you're waiting on |
| `<id>` | left open | — | couldn't reproduce / why |

The board URL is `https://<board.owner>.github.io/<board.repo>/`. Link it so the human
can Resolve / Reject / Respond.

---

## 8. Triggers — running this loop without a human (optional)

Manual (`/fix-issues`) is one trigger. To remove the human from the inner cycle, the
board ships `tools/loop.mjs` (see `LOOP.md`):

| Trigger | Command | What it does |
| --- | --- | --- |
| **Manual** | `/fix-issues` | what you're doing now |
| **Schedule** | `node tools/loop.mjs schedule` | prints the cron / Task Scheduler line that runs the agent on a cadence |
| **Action** | `node tools/loop.mjs watch` | polls the board for new open issues and kicks the agent when work lands |
| **Status** | `node tools/loop.mjs status` | shows the live goal (satisfaction bar, test gate) + open count |

These shell out to `loop.schedule.agentCmd` (default `claude -p "/fix-issues"`), so the
scheduled/action runs re-enter this very skill. The satisfaction bar is tuned live from
the board's header slider — always trust the `loop` block in the `pull` manifest.
