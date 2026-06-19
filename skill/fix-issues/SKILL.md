---
name: fix-issues
description: Fetch open QA issues from the snapfix board, fix each in the app, recapture the screen, and publish results. Use when asked to "fix issues", "fix the QA issues", or "run the issue loop".
user-invocable: true
argument-hint: "[issue id (optional — default: all open)]"
---

# Fix QA Issues Loop

This is the snapfix automation: filed QA issues (screenshot + description, posted
from the board) come in, you reproduce each in the real app, fix the **root cause**
in the app's source, recapture proof, and publish a before/after card back to the
board. GitHub is the only backend — a public board repo (metadata + static page)
and a private repo (screenshots). You never touch GitHub directly; the board's
`tools/qa.mjs` CLI does, via the `gh` CLI.

Each issue has a LEFT side (the user's screenshot + description) and a RIGHT side
you populate (the fixed screenshot + a plain-language root-cause/fix note).

> **Everything project-specific lives in `qa.config.json`.** This skill is generic.
> Read that file first and drive every step from it — board repo location, dev
> server URL, viewport, recapture command, and auth strategy. Never hardcode a
> repo name, port, route, or login flow that the config can tell you.

If an issue id was passed as the argument, operate on that single issue. Otherwise
process **all open issues, oldest first**.

---

## 0. Read the config

Find `qa.config.json` (project root of the app — the current working directory, or
search upward if not found). Parse it once; refer back to these keys throughout:

```json
{
  "board":     { "owner": "USER", "repo": "myapp-qa", "private": "myapp-qa-private", "branch": "main" },
  "app":       { "repo": "..", "devServer": "http://localhost:5173", "viewport": "390x844", "framework": "vite" },
  "reproduce": { "tool": "playwright", "recaptureCmd": "node recapture.mjs {route} {out}" },
  "auth":      { "strategy": "none", "tokenKey": "access_token", "loginUrl": "/" }
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
| `auth.tokenKey` | localStorage key the app reads its JWT from (for `seeded-jwt`) |
| `auth.loginUrl` | the route to drive for `manual-otp` login |

If `qa.config.json` is missing, stop and tell the user to run `npx github:OWNER/snapfix init`
(or to create the config) — the loop can't run without it.

---

## 1. Sync the board

Locate the board repo. Resolve its local path (a sibling checkout of `board.repo`,
or wherever it was cloned). If it isn't present locally, clone it:

```
gh repo clone <board.owner>/<board.repo> <local board path>
```

Then pull the open issues as a manifest:

```
node <board path>/tools/qa.mjs pull
```

`pull` rebases the board repo, then prints a JSON manifest of open issues with
**locally-downloaded private images**. Each entry:

```jsonc
{
  "id": "...",
  "createdAt": "...",
  "route": "/some/route",          // may be null — infer from the screenshot if so
  "description": "...",
  "imagePrivate": true,
  "image": "<abs local path>",      // first screenshot, already downloaded
  "images": ["<abs path>", ...],    // all screenshots (multi-image support)
  "reopenNote": "...|null",         // owner's note if a prior fix was rejected
  "needsReview": false,
  "reviewReason": "...|null",
  "reviewReply": "...|null",        // owner's answer to a prior needs-review (read this!)
  "tags": ["..."]|null
}
```

If `count` is 0 → report "no open issues" and stop.

---

## 2. Dev server

Probe `app.devServer` (HTTP GET). If it's not up, start it in the background and wait
until it serves, then continue. Start command by `app.framework`:

| `app.framework` | start command |
| --- | --- |
| `vite` / `next` / `react` / `vue` | `npm run dev` (in `app.repo`) |
| `static` | serve the directory (e.g. `npx serve`) |
| anything else | run the project's documented dev command; if unknown, check `package.json` `scripts.dev` / `scripts.start` |

Do not assume the port — use the exact `app.devServer` value. If the configured port
is taken by an unrelated process, surface that rather than reproducing against the
wrong app.

---

## 3. Auth preflight

Branch on `auth.strategy`:

- **`none`** — nothing to do. Routes are public; reproduce directly.
- **`seeded-jwt`** — obtain a valid JWT and inject it before navigating:
  open `app.devServer`, then in the browser set `localStorage[auth.tokenKey]` to the
  token and reload. Where the token comes from is project-specific (a dev/mint
  script, an env var, or a long-lived test token) — if the project documents one,
  use it; if there is no valid token available, set the issue to needs-review (see
  §5) explaining the auth blocker rather than guessing.
- **`manual-otp`** — drive the login UI and ask the human for the code:
  1. Navigate to `auth.loginUrl` on the dev server (Playwright MCP).
  2. Enter the test account / request the code, then **ask the user for the OTP**
     in chat and submit it.
  3. After login, the app stores its session itself; subsequent navigations reuse it.
  This is the only sanctioned mid-loop human question (OTP can't be inferred).

Verify you land on an authenticated page before processing issues. If auth fails and
can't be recovered, stop and report — don't reproduce against a logged-out app.

---

## 4. Per issue (oldest first)

For each issue in the manifest, in `createdAt` order:

1. **Read the inputs.** Use the Read tool on every path in `images[]` (it renders the
   screenshots) and read `description`, `route`, and — if present — `reopenNote`
   (owner's reason a prior fix was rejected) and `reviewReply` (owner's answer to a
   prior needs-review). These notes are direction; honor them.

2. **Reproduce.** In the browser (`reproduce.tool`, default Playwright MCP), set the
   viewport to `app.viewport`, navigate to `app.devServer` + `route`, and confirm you
   can see the reported problem. If `route` is null/wrong, infer it from the
   screenshot and the app's routes.
   - **Can't reproduce** → leave the issue **open**, note it in the wrap-up, and move
     on. Do **not** resolve an issue you couldn't reproduce.

3. **Root-cause and fix.** Find the real cause in the app's source (`app.repo`) and
   fix *that* — not a cosmetic patch over the symptom. Match the project's existing
   conventions, design tokens, and component patterns. Keep the change surgical:
   every changed line should trace to this issue.
   - **Genuinely ambiguous** (multiple valid interpretations, a product/design
     decision, or a missing asset/credential you can't supply) → **don't guess.**
     Set the issue to needs-review (§5) and move on to the next issue.

4. **Verify live.** Reload the reproduced screen and confirm the problem is gone and
   nothing adjacent broke. Verification is by execution — seeing it fixed in the
   running app, not by reading the diff.

5. **Recapture proof.** Run `reproduce.recaptureCmd` with `{route}` → the issue's
   route and `{out}` → an output path **inside the board repo's `tmp/`**, never inside
   the app repo (screenshots must never enter the app's git history, and the board
   keeps proof out of the public repo by uploading via the CLI):

   ```
   # ensure <board path>/tmp exists, then e.g.
   node recapture.mjs <route> "<board path>/tmp/<id>-fix.png"
   ```

   Then **Read the PNG** to confirm the fix is actually visible in the captured image.
   If recapture fails (auth expired, navigation failure, etc.), fix the cause and
   retry — don't publish an unverified or stale shot.

6. **Publish.** Resolve the issue with the proof and a user-facing note:

   ```
   node <board path>/tools/qa.mjs resolve <id> \
     --image "<board path>/tmp/<id>-fix.png" \
     --desc "Root cause: … Fix: …" \
     --app-commit <app sha>
   ```

   - `--image` is repeatable: a fix spanning two screens / scroll positions can pass
     multiple `--image` flags (shown side-by-side on the board).
   - `--desc` is shown to the user — 1–3 plain sentences: what was actually wrong and
     what you changed. No jargon dumps.
   - `--app-commit` is the commit sha of your fix (commit first, see §6).
   - `resolve` uploads the shot to the **private** repo via the `gh` API and commits
     only metadata to the public board. The published fix is a **proposed fix** until
     the human accepts it (§5).

---

## 5. The two-way review channel (read this carefully)

The board is a conversation, not a one-way dump. Two directions:

**You → human (you're blocked).** When you can't proceed without a human decision —
ambiguous requirement, a product/design call, a needed asset or credential you can't
produce — **do not guess and do not silently skip.** Flag it:

```
node <board path>/tools/qa.mjs review <id> --reason "<what you need / why you can't proceed>" [--tags a,b]
```

This sets `needsReview` on the issue; the board floats it to the top with a **"User
review"** card showing your reason and **Resolve / Reject / Respond** buttons. Then
move on to other issues — never stall the whole loop on one blocker.

**Human → you (their reply).** The human acts on the card:
- **Respond** → records `reviewReply` and clears `needsReview`, putting the issue back
  in the open queue *with their answer attached*. On the next loop tick you read
  `reviewReply` from the manifest and proceed using it as direction.
- **Resolve** → accepts the current state and moves the issue off the board (into the
  resolved archive). This is how a *proposed fix* becomes *done* — it is not done
  until the human taps Resolve.
- **Reject** ("not fixed") → sends the issue back to the open queue with an optional
  note. The note arrives as `reopenNote` in the manifest; the **prior fix is preserved
  in the issue's `history` (the board's "previous fix" dropdown)** — never lost. Read
  the note, understand why the first attempt missed, and re-fix.

Net: a `resolve` you publish is a **proposal**. Acceptance (Resolve), rejection
(Reject → re-fix), and clarification (Respond → `reviewReply`) are the human's, and
each comes back to you through the next `pull`.

---

## 6. Conventions

- **Can't reproduce** → leave open, note it in the summary, do **not** resolve.
- **Ambiguous / blocked on a human** → `review` it (§5) rather than guessing. Keep going on the rest.
- **One commit per issue** (subject like `fix(qa): <id> — <short>`), or a single batch
  commit if you fixed several in one pass — match the scope. Pass that sha as
  `--app-commit`. Commit before `resolve` so the sha is real.
- **Root cause, not cosmetic.** A patch that hides the symptom but leaves the cause is
  not a fix.
- **Surgical changes.** Don't refactor unrelated code or "improve" adjacent files.
- **Screenshots stay out of the app repo.** Recapture output goes to the board repo's
  `tmp/` only; the CLI moves it to the private image store. Nothing image-related is
  ever committed to the public board or the app repo.
- **Project flow docs.** If the project documents a user-flow/source-of-truth doc (in
  `qa.config.json`, the app's `CLAUDE.md`, or a `docs/` convention) and your fix
  changes a user-facing flow, update that doc in the same commit.

---

## 7. Wrap-up

End with a summary table — one row per issue:

| id | status | note |
| --- | --- | --- |
| `<id>` | fixed | root-cause one-liner + board URL |
| `<id>` | needs-review | what you're waiting on |
| `<id>` | left open | couldn't reproduce / why |

The board URL is `https://<board.owner>.github.io/<board.repo>/`. Link it so the human
can review the proposed fixes and Resolve / Reject / Respond.
