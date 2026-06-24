# Changelog

All notable changes to snapfix are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The loop release — snapfix reframed as **the LLM loop project**: a general framework
where an AI agent works toward a goal until it's met, with the human out of the inner
cycle. The screenshot-to-AI-fix QA board is now its flagship loop.

### Added

- **Board: edit a submitted response** — an inline ✎ Edit on the response note re-opens the respond composer pre-filled, so the owner can revise their answer to Claude any time (even while the issue is awaiting re-fix), not just on first reply.
- **Board: review-reason text wraps** — long review reasons (URLs, SHA fingerprints, multi-line) no longer clip at the card edge (`white-space: pre-wrap; overflow-wrap; word-break`).
- **One-line autonomous setup** (`snapfix init --auto`) — reads the target project and, in a single command: **copies the app's design language** (accent/bg/ink/radius/font tokens) onto the board, **recommends project-relevant loops** from the Loop Library (→ `RECOMMENDED-LOOPS.md` + `loops/`), **auto-tunes** the loop (trigger, **tick duration**, satisfaction bar) from detected signals, installs the **fix-issues + caveman** skills, **seeds a `[snapfix demo]` test issue**, and runs the fix-issues loop once to fix it. `--tick`, `--trigger`, and `--no-fix` refine it; `--auto` implies `--yes`.
- **Design-language copy** — `bin/lib/theme.mjs` extracts CSS custom properties / Tailwind tokens / Google font from the app; the board's `applyTheme()` maps them onto its CSS variables so the board matches the app.
- **Project-relevant loop selection** — `bin/lib/loops.mjs` builds the catalog from `loops/` and selects loops by project signals (web, tests, CI, design tokens, docs).
- **Bundled skills install** — every skill under `skill/*` (fix-issues + the vendored MIT-licensed **caveman** terse-mode skill) installs into the app's `.claude/skills/`.
- **The loop model** ([LOOP.md](LOOP.md)) — a loop = **trigger** (manual · schedule · action) + **goal** (verifiable *or* LLM-as-judge). The source-of-truth doc.
- **Trigger layer** (`tools/loop.mjs`) — `run` (one tick), `watch` (action trigger: kick the agent when a new issue lands), `schedule` (print the cron / Task Scheduler line), `verify` (the verifiable gate), and `status` (config, open count, live satisfaction bar). `--agent "<cmd>"` overrides the configured agent command so any catalog loop can ride the same runner.
- **Verifiable goal** — the app's test gate. A fix posts only when the configured test command passes and clears the coverage threshold (`loop.goal.tests`).
- **LLM-as-judge goal** — a board-adjustable **satisfaction slider** (stored in `data/loop.json`). The agent self-scores each fix and posts only when it clears the bar; set to 0 to disable.
- **Goal-proof badges** on fix cards — each before/after card shows which gates it cleared (tests passed · judge score).
- **Full multi-user attribution** — every action carries the actor (*filed by* / *fixed by* / *answered by*) with avatars, authenticated by each user's own GitHub token. No accounts, no server.
- **The Loop Library** (`loops/`) — the full 46-loop catalog from Forward Future's [Loop Library](https://signals.forwardfuture.ai/loop-library/) ported to per-loop files (trigger, goal kind, category, verbatim prompt), grouped into Engineering / Evaluation / Operations / Content / Design, with fix-issues as the flagship.
- **The `/goal` command** documented ([LOOP.md](LOOP.md) §1.3) — the Codex / Claude Code agent-native way to express a loop's stopping condition, mapped to snapfix's `verify` + satisfaction dual gate.
- **Zero-dependency test suite** — `node:test` runner (`npm test`) plus CI.

### Changed

- Repositioned snapfix from "a QA board" to "the LLM loop project"; the QA flow is documented as the flagship loop.

## [0.1.0]

The screenshot-to-AI-fix QA board — snap a bug from your phone, let an AI agent fix the
real code, get before/after proof. No server, no database; GitHub is the entire backend.

### Added

- **One-command setup** — `npx github:shakeebshaan/snapfix init` creates the repos, enables GitHub Pages, deploys the board, and installs the skill.
- **Two-repo backend** — a **public** board repo (GitHub Pages + issue metadata) and a **private** image repo (screenshots, never public).
- **GitHub-only backend** — no server, no database; the static board talks to the GitHub REST API directly with a fine-grained token.
- **The `fix-issues` skill** — a Claude Code skill that reads open issues, fixes your real app code, recaptures the fixed screen, and posts the result.
- **Before/after proof** — each fix posts a card pairing the original bug shot with a fresh recapture of the fixed screen.
- **Two-way review** — verify each fix on the board: **✓ Resolve**, **✗ Not fixed** (re-fix loop), or **↩ Respond** when the agent asks a question.

[Unreleased]: https://github.com/shakeebshaan/snapfix/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/shakeebshaan/snapfix/releases/tag/v0.1.0
