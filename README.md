# snapfix

**Snap a screenshot, describe the bug, let an AI agent fix the real code.** snapfix is a screenshot-to-AI-fix QA board that any project can stand up with one command. There is **no server and no database** — GitHub is the entire backend.

- A **public** repo serves the board (GitHub Pages) and stores issue *metadata*.
- A **private** repo stores the *screenshots* (token-gated, never public).
- A **Claude Code skill** (`fix-issues`) reads filed issues, fixes your real app code, recaptures proof, and posts before/after cards.

Project-agnostic: point it at any web app (Vite, Next, CRA, Astro, plain static — anything Playwright can open).

---

## Quick start

From inside your app's project directory:

```bash
npx github:shakeebshaan/snapfix init
```

That one command:

1. Creates **two GitHub repos** for your project — `<app>-qa` (public board) and `<app>-qa-private` (private image store).
2. Enables **GitHub Pages** on the public repo and deploys the board.
3. Writes **`config.js`** (board runtime config) and **`qa.config.json`** (project config).
4. Installs the **`fix-issues` skill** into your app's `.claude/skills/`.
5. Prints your live board URL: `https://<owner>.github.io/<app>-qa/`

Open that URL on your phone, connect a token, and start snapping bugs.

---

## How it works

GitHub is the only backend. Three pieces, no infrastructure:

```text
                          ┌─────────────────────────────────────────┐
   you, on your phone     │  PUBLIC repo:  <app>-qa                  │
   ──────────────────►    │  • index.html  (the board, via Pages)    │
   snap + describe        │  • data/issues.json   (METADATA only)    │
                          │  • config.js / qa.config.json            │
                          └───────────────┬─────────────────────────┘
                                          │  image upload via GitHub API
                                          ▼
                          ┌─────────────────────────────────────────┐
                          │  PRIVATE repo: <app>-qa-private          │
                          │  • images/<id>.jpg     (SCREENSHOTS)     │  ← never public, ever
                          │  • images/<id>-fix.png (PROOF)           │
                          └───────────────┬─────────────────────────┘
                                          │  reads open issues, posts fixes
                                          ▼
                          ┌─────────────────────────────────────────┐
                          │  Claude Code skill: fix-issues           │
                          │  (lives in YOUR app repo .claude/skills) │
                          │  pull → fix real code → recapture → post │
                          └─────────────────────────────────────────┘
```

The board is a **single static HTML file** — no build step, no framework. It talks to the GitHub REST API directly from the browser using a token you paste in (kept in `localStorage`). The CLI and skill talk to GitHub via the `gh` CLI you've already authenticated.

---

## What you get

| | |
| --- | --- |
| **A board at a URL** | `https://<owner>.github.io/<app>-qa/` — open it on any device. Issues sorted: needs-your-review → open → resolved. |
| **File issues from your phone** | Snap a screenshot, type what's wrong, submit. Works as a one-handed mobile flow. |
| **AI fixes with proof** | The agent edits real app code and posts a **before/after card** — your bug shot next to a fresh recapture of the fixed screen. |
| **Two-way review** | Verify each fix on the board: **✓ Resolve**, **✗ Not fixed** (re-fix loop), or **↩ Respond** when the agent asks a question. |
| **Zero infrastructure** | No server to run, no DB to back up, no hosting bill. It's GitHub repos + Pages. |

---

## Setup details

`snapfix init` uses your `gh` CLI session to create the repos and deploy. For **filing and resolving issues from the board UI**, the browser needs its own token (the board is static; it can't borrow your `gh` session).

### Create the board token (one-time)

1. Go to **GitHub → Settings → Developer settings → Fine-grained personal access tokens → Generate new token**.
2. **Repository access** → *Only select repositories* → choose **both**:
   - `<owner>/<app>-qa` (public board)
   - `<owner>/<app>-qa-private` (private images)
3. **Permissions → Repository permissions → Contents → Read and write.**

   | Permission | Level | Why |
   | --- | --- | --- |
   | **Contents** | **Read and write** | Read/write `data/issues.json`, upload screenshots to the private repo |
   | Metadata | Read-only (auto) | Always required by fine-grained PATs |

   No other scopes are needed — not Pages, not Issues, not Actions.
4. Generate, copy the token, open the board, tap the connection chip in the header, and paste it. It is stored only in your browser's `localStorage` and sent only to `api.github.com`.

> A single token covering both repos is enough. The board uploads images to the private repo and metadata to the public repo with the same token.

---

## The fix loop

```text
  file ──► AI fixes ──► recapture ──► you verify
   │                                      │
   │         ✗ Not fixed (re-fix) ◄───────┤
   │                                      │
   └──────────── ↩ Respond ◄──────────────┘  (agent asked a question)
```

1. **File.** You snap a screenshot on the board and describe the problem. Lands as `Submitted` in `data/issues.json`; image goes to the private repo.
2. **AI fixes.** In your app repo, the `fix-issues` skill runs: `qa.mjs pull` → edits the real code → fixes the root cause.
3. **Recapture.** The skill runs `recapture.mjs <route> <out>` to take a fresh screenshot of the fixed screen, then `qa.mjs resolve <id> --image <out> --desc "<what changed>"`. The card flips to a **Proposed fix** with before/after shots.
4. **You verify** on the board:
   - **✓ Resolve** — accept it; the issue moves to the Resolved list (off the active board).
   - **✗ Not fixed** — reject with a note; it reopens as a **Re-fix** for the agent to try again (previous attempts are preserved on the card).
   - **↩ Respond** — when the agent couldn't auto-fix and flagged the issue for your review (e.g. a missing asset or a product decision), reply with your answer; it goes back in the queue with your response attached.

---

## Configuration

`snapfix init` writes **`qa.config.json`** into both your **app repo** (at its root, where the `fix-issues` skill runs) and the board repo. Every snapfix file (board, CLI, skill, recapture) agrees on these exact keys:

```json
{
  "board":     { "owner": "USER", "repo": "myapp-qa", "private": "myapp-qa-private", "branch": "main" },
  "app":       { "repo": ".", "devServer": "http://localhost:5173", "viewport": "390x844", "framework": "vite" },
  "reproduce": { "tool": "playwright", "recaptureCmd": "node recapture.mjs {route} {out}" },
  "auth":      { "strategy": "none", "tokenKey": "access_token", "loginUrl": "/" }
}
```

### `board` — the two GitHub repos

| Key | Meaning |
| --- | --- |
| `owner` | Your GitHub username/org. |
| `repo` | The **public** board repo (Pages + metadata, no images). |
| `private` | The **private** repo that stores screenshots only. |
| `branch` | Branch both repos publish from (Pages source). Usually `main`. |

### `app` — your actual application

| Key | Meaning |
| --- | --- |
| `repo` | Path to your app repo **relative to the board repo** (`..` when the board is a sibling/subdir). |
| `devServer` | Local URL `recapture.mjs` opens to take screenshots. |
| `viewport` | `WIDTHxHEIGHT` in CSS px. `390x844` = iPhone-sized (default mobile target). |
| `framework` | Hint for the skill: `vite` \| `next` \| `cra` \| `astro` \| `other`. |

### `reproduce` — how proof is recaptured

| Key | Meaning |
| --- | --- |
| `tool` | The driver. `playwright`. |
| `recaptureCmd` | Command run from the board repo. `{route}` → the issue's route, `{out}` → output image path. |

### `auth` — reaching authenticated routes

| `strategy` | Behavior |
| --- | --- |
| `none` | Routes are public; no login before screenshotting. |
| `seeded-jwt` | A JWT is injected into `localStorage[tokenKey]` before navigating. |
| `manual-otp` | The skill drives the login form and asks you for the OTP code. |

| Key | Meaning |
| --- | --- |
| `tokenKey` | The `localStorage` key your app reads the auth token from. |
| `loginUrl` | The route the login flow starts at. |

> See `template/qa.config.example.json` for the same config annotated inline.

### Board runtime config (`config.js`)

The board itself reads `window.QA_CONFIG = { owner, repo, privateRepo, branch }` from `config.js` (written by the CLI). **If `config.js` is absent, the board auto-detects** from its Pages URL:

```text
https://OWNER.github.io/REPO/
   owner       = OWNER          (hostname before ".github.io")
   repo        = REPO           (first path segment)
   privateRepo = REPO + "-private"
   branch      = "main"
```

So the common case is zero-config; `config.js` only matters for custom domains or viewing the board over `file://`.

---

## Privacy

**Screenshots are never committed to the public repo — not even transiently.** They are uploaded straight to the **private** repo through the GitHub API. The public repo only ever holds metadata (`data/issues.json`) and the static board.

- No screenshot ever enters the public repo's git history.
- The board fetches private images using your token and shows them only in your authenticated browser session.
- Bug shots and fix-proof shots both live exclusively in the private repo.

If a UI screenshot would leak something sensitive, it's safe — the public surface never sees the pixels.

---

## Requirements

| Tool | Why |
| --- | --- |
| **`gh` CLI** (authenticated) | The setup command creates repos, enables Pages, and deploys via your GitHub session. |
| **Node ≥ 18** | Runs the CLI, `qa.mjs`, and `recapture.mjs`. ESM, Windows-friendly, **zero npm dependencies**. |
| **A Claude Code agent** | Runs the `fix-issues` skill that does the actual fixing. |
| **Playwright in your app** | Used by `recapture.mjs` to screenshot routes for before/after proof. |
| **A fine-grained PAT** | For the browser board to read/write issues (Contents: R/W on both repos). |

---

## FAQ

**Does GitHub charge for this?**
No — private repos and GitHub Pages are free. Screenshots are stored as normal git blobs (not Git LFS), so there's no LFS bandwidth or storage bill.

**Where do screenshots go?**
Only the private repo, via the GitHub API. The public board repo never receives an image, not even briefly. See [Privacy](#privacy).

**Do I need to run a server?**
No. The board is a single static HTML file on GitHub Pages. There is no backend process and no database.

**Does this work with my framework?**
Yes — it's project-agnostic. Anything Playwright can open works (Vite, Next.js, CRA, Astro, plain static). Set `app.framework` and `app.devServer` in `qa.config.json`.

**How does the board authenticate without a server?**
It calls the GitHub REST API directly from the browser using a fine-grained PAT you paste in. The token lives only in your browser's `localStorage`.

**My app needs login to reach the buggy screen.**
Set `auth.strategy` to `seeded-jwt` (inject a token) or `manual-otp` (the skill drives login and asks you for the code). See [Configuration → `auth`](#auth--reaching-authenticated-routes).

**Can I host the board on a custom domain?**
Yes. Auto-detection assumes `OWNER.github.io/REPO`; for a custom domain, set explicit values in `config.js`.

---

## License

MIT
