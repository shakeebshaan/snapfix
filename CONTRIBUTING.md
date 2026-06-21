# Contributing to snapfix

Thanks for being here. snapfix is open source, dependency-free, and small enough to hold
in your head — which makes it a genuinely pleasant thing to hack on. This guide gets you
from clone to passing tests to merged PR without surprises.

> New to the project? Read **[README.md](README.md)** for what snapfix is, and
> **[LOOP.md](LOOP.md)** for the loop model it's built on. This page is about working *on*
> the code, not *with* it.

---

## Set up — there is nothing to install

snapfix has **zero runtime npm dependencies**. Node ≥ 18 builtins only. So setup is
exactly one step longer than `git clone`:

```bash
git clone https://github.com/shakeebshaan/snapfix.git
cd snapfix
npm test                 # runs the built-in node:test suite — NO npm install needed
```

If you reflexively reached for `npm install`: don't. There is no `package-lock.json` and
nothing to fetch — an install step has nothing to do (and our CI deliberately omits it;
see [`.github/workflows/test.yml`](.github/workflows/test.yml)). `npm test` just runs
`node --test` straight off a clean checkout.

```bash
npm test                 # node --test — the whole suite
npm run test:coverage    # node --test --experimental-test-coverage (Node 20+)
```

You need **Node ≥ 18**. That's the only hard requirement to run the tests. (To actually
*use* snapfix end-to-end you'd also want the `gh` CLI and Playwright — but those are for
running the board, not for contributing to it. See the README's Requirements table.)

---

## Repo layout

snapfix is four moving parts plus a test suite. Know which one your change belongs in:

| Path | What lives here |
| --- | --- |
| **`bin/create.mjs`** | The setup CLI (`snapfix init`). Creates the two GitHub repos, enables Pages, writes config, installs the skill. The thing `npx github:shakeebshaan/snapfix init` runs. |
| **`template/`** | Everything that gets copied into a user's board repo: `index.html` (the entire board — one static file), `tools/qa.mjs` (the GitHub-backed issue CLI), `tools/loop.mjs` (the loop runner), `recapture.mjs` (Playwright proof shots), and the `data/` + `qa.config.example.json` scaffolding. |
| **`skill/fix-issues/`** | `SKILL.md` — the Claude Code skill contract: the agent's instructions for the fix-issues loop (pull → fix → verify → self-score → recapture → post). |
| **`loops/`** | The **Loop Library** — a catalog of reusable loop recipes, one markdown file each, indexed by [`loops/README.md`](loops/README.md). |
| **`tests/`** | The `node:test` suite — `cli.test.mjs`, `create.test.mjs`, `loop.test.mjs`. |
| `LOOP.md` | Source-of-truth doc for the loop model. Keep it in sync when loop behavior changes. |

A change usually touches **one** of `bin/`, `template/`, `skill/`, or `loops/`. If it's
spanning several, that's a sign to split it — see *Coding conventions* below.

---

## Tests

We use the **built-in `node:test` runner** — no Jest, no Vitest, no test framework to
install. A test file is plain ESM that imports from `node:test` and `node:assert/strict`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";

test("describes the contract it protects", () => {
  assert.equal(actual, expected);
});
```

Run the whole suite with `npm test`. Run one file with `node --test tests/loop.test.mjs`.

### What's covered today — and what isn't

Be calibrated about this; it shapes where new tests earn their keep:

- **Covered (unit):** the **pure logic** — config parsing, defaulting, and derivation
  (e.g. `loopConfig`, `loadConfig`, `appDir`, `readCoveragePct`), and the **loop's
  verifiable gate** (`verify`: tests + coverage → exit code). These are deterministic and
  cheap to assert, so they're tested directly. The modules export their helpers and honor
  `SNAPFIX_NO_MAIN=1` so the CLI dispatch stays inert on import — that's the seam the unit
  tests use; preserve it.
- **Not unit-tested (by design):** the **`gh` / `git` / Playwright integration layer** —
  repo creation, Pages enablement, image upload, screenshot recapture. These reach real
  external systems, so they're exercised by **integration tests and real-world use**, not
  mocked into the unit suite. Don't fake `gh` or a browser just to hit a coverage number;
  a test that asserts against a mock you wrote teaches you nothing about GitHub.

### Writing a good test

Every test must **name and protect a contract** — a behavior, an invariant, a failure
mode — and fail precisely when that contract breaks. Concretely:

- Test the **pure function**, not the I/O around it. If your change is mostly logic, pull
  the logic into an exported helper and unit-test that (the existing code already does
  this — follow the pattern).
- Keep tests **deterministic and isolated**. Use `node:os` `tmpdir()` + `mkdtempSync` for
  filesystem fixtures and clean up after; never depend on machine state, the network, or
  the order tests run in.
- Prefer **cross-platform** assertions — tests run on Node 18/20/22 on Linux in CI and on
  Windows + POSIX locally. Spawn helper processes via `process.execPath`, not a hardcoded
  `node`; build paths with `node:path`, not string concatenation.
- If you fix a bug, add the test that would have caught it **first** (it should fail
  before your fix, pass after).

CI runs `npm test` on Node 18, 20, and 22, plus a non-blocking coverage job. Green on all
three is the bar.

---

## Coding conventions

These aren't style preferences — they're the project's identity. A PR that breaks one of
them won't merge until it's resolved.

- **Zero runtime dependencies.** Node ≥ 18 builtins only. No `dependencies`, no
  `devDependencies`, no `package-lock.json`. If you find yourself wanting a library,
  you're either solving the wrong problem or about to write 20 lines that earn their
  place. (Dev tooling that isn't shipped or installed — like the loop runner shelling out
  to an agent CLI — is fine; vendored npm packages are not.)
- **ESM only.** `import` / `export`, `"type": "module"`. No CommonJS, no `require`.
- **Windows + POSIX friendly.** Both are first-class. Use `node:path` for paths, spawn via
  `process.execPath`, never assume `/` or a shell. Scripts and shebang files must stay LF
  (see `.gitattributes`) so `npx` works cross-OS. Test on the platform you don't normally
  use, or at least reason about it.
- **Config-driven.** Behavior comes from `qa.config.json` (and the live `data/loop.json`),
  not from hardcoded values. Every snapfix file agrees on the same config keys — if you
  add a knob, add it to the schema, the `qa.config.example.json`, the README config
  section, and `LOOP.md` if it's loop-related. Don't introduce a second source of truth.
- **Surgical changes.** Match the surrounding code; change the minimum to fix the root
  cause. Resist the urge to "tidy" adjacent code in the same PR — if you spot real rot,
  open a separate issue or PR for it. Small, single-purpose diffs review fast and revert
  cleanly.
- **Voice.** Docs and user-facing strings match the README: calm, precise, a little
  playful, never breathless. Explain the *why*, not just the *what*.

---

## Adding a loop to `loops/`

The [Loop Library](loops/README.md) is meant to grow. A new loop is one markdown file in
`loops/` plus an index entry. Steps:

1. **Create `loops/<your-loop>.md`** with YAML front-matter matching the existing files:

   ```yaml
   ---
   name: your-loop
   title: Human-readable title
   category: Engineering        # Engineering | Evaluation | Operations | Content | Design
   trigger: manual              # manual | schedule | action (note variations inline)
   goal: verifiable — <the exact stop condition>   # or: LLM-as-judge — <the bar, in words>
   source: <where it came from, e.g. Loop Library video, or "snapfix original">
   ---
   ```

2. **Write the body** following the shape of
   [`sub-50ms-page-load.md`](loops/sub-50ms-page-load.md): a `## What it does`,
   `## Trigger`, `## Goal`, a copy-pasteable `## Prompt` block (the load-bearing part —
   make it runnable as-is), and `## Notes / caveats` (token cost, failure modes, when
   *not* to use it). Be honest about the caveats; a loop without a stopping condition is a
   chat, and a loop that can wander should say so.

3. **Name the goal kind honestly.** Verifiable (a deterministic check the machine
   settles) vs. LLM-as-judge (the model decides it's satisfied). If it's both, say so —
   "verifiable floor, judged ceiling." This is the single most important thing a loop
   entry communicates; see [`LOOP.md` §1.2](LOOP.md).

4. **Add it to the catalog** in [`loops/README.md`](loops/README.md): a row in the right
   category table, and — if you wrote a full detail file — a bullet under *Detailed loops*.

5. **No code required.** A loop is a recipe, not a program. It rides the existing
   `tools/loop.mjs` runner via `loop.schedule.agentCmd`. Only touch `template/tools/` if
   the loop genuinely needs a new runner capability — and if it does, that's a separate
   conversation in the PR.

---

## PR flow

1. **Open an issue first** for anything non-trivial — a bug, a feature, a new loop. It
   lets us agree on the approach before you write code, and it's where we'll flag if a
   change cuts against a convention. Tiny fixes (typos, an obvious one-liner) can skip
   straight to a PR.
2. **Branch** off `main`. Keep the branch scoped to one change.
3. **Write the code and the test together.** A behavior change without a test that
   protects it won't merge. A bug fix should include the test that would have caught it.
4. **Run `npm test` locally** — green on your Node version. If you can, sanity-check the
   other platform (Windows ↔ POSIX).
5. **Keep the diff surgical.** One purpose per PR. If you discover unrelated rot, note it
   in the PR description and open a follow-up — don't fold it in.
6. **Update the docs in the same PR.** If you changed config, behavior, or a loop, update
   the relevant doc (README / `LOOP.md` / `qa.config.example.json` / the loop's `README`)
   so the source of truth never drifts.
7. **Open the PR** with a description that says *what* changed and *why*, and links the
   issue. CI runs `npm test` across Node 18/20/22 — it must be green.
8. **Review.** We'll be quick, specific, and kind. Expect questions about blast radius and
   convention fit, not nitpicks for their own sake.

By contributing you agree your work is licensed under the project's [MIT License](LICENSE),
and that you'll uphold the [Code of Conduct](CODE_OF_CONDUCT.md).

Welcome aboard. Snap, fix, repeat.
