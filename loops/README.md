# The Loop Library

A catalog of reusable **loops** — small, copy-pasteable autonomy recipes for an AI coding
agent. snapfix's screenshot-to-AI-fix QA board is one of them (the flagship
[fix-issues loop](fix-issues-qa.md)); the rest are templates you can drop into any project.

The model itself — what a loop *is*, the two trigger families, the two goal kinds — lives
in the source-of-truth doc: **[`../LOOP.md`](../LOOP.md)**. This page is the index.

Concept credit: the loop framing (trigger + goal; verifiable vs. LLM-as-judge) comes from
Forward Future's **[Loop Library](https://signals.forwardfuture.ai/loop-library/)**. snapfix
bakes that framing into a runnable, GitHub-backed system and ports the catalog here.

---

## The loop model, in one breath

A loop is **a trigger plus a goal**, and the agent repeats until the goal is met — no human
in the inner cycle:

```text
loop = trigger + goal
       │         └── what "done" means; the agent loops until it's reached
       └── what kicks it off (manual · schedule · action)
```

The **goal** comes in two kinds, and the kind decides how much you can trust the result:

- **Verifiable** — a deterministic check the machine can settle: a passing test suite, a
  coverage number, a byte budget, a sub-50ms metric. Unambiguous; the loop has a true stop.
- **LLM-as-judge** — the model decides when it's "satisfied" ("refactor until it's clean").
  Powerful for taste work, brittle by nature — you've delegated the bar to the model.

Many loops here combine both (verifiable floor, judged ceiling). Full definitions, the
caveats, and snapfix's own dual-gate are in [`../LOOP.md`](../LOOP.md).

---

## How to run a loop with snapfix

A loop is just a prompt plus a stopping condition. Three steps:

1. **Paste the prompt to your agent.** Open the loop's detail file (or copy the objective
   from the table below) and hand it to your CLI agent — `claude -p "<prompt>"`, or any
   agent you like. snapfix is bring-your-own-agent; the loop is the recipe, not the model.

2. **Add a stopping condition.** This is the goal, made concrete. For a *verifiable* loop,
   name the exact check — `npm test` green, `coverage = 100`, `bundle < 50KB`,
   `p75 load < 50ms`. For an *LLM-as-judge* loop, name the bar in words — "loop until you'd
   ship this to a paying customer", "score ≥ 80 against the rubric". Without a stopping
   condition the agent wanders; the condition is what makes it a loop instead of a chat.

3. **(Optional) Schedule or watch it via `tools/loop.mjs`.** To take yourself out of the
   *outer* cycle too, let the runner pull the trigger:

   ```bash
   node tools/loop.mjs run                       # one tick: invoke the agent once
   node tools/loop.mjs watch --interval 60       # action: poll for work, kick the agent, repeat
   node tools/loop.mjs schedule --cron "0 9 * * *"  # print the OS-scheduler line to install
   node tools/loop.mjs verify                    # run the verifiable gate; exit 0 = goal met
   ```

   `verify` is the shared verifiable check — the skill calls it before posting a fix, `watch`
   uses it as the stop, and CI can call it too. The agent command is configurable
   (`qa.config.json → loop.schedule.agentCmd`), so any of the loops below can ride the same
   runner. See [`../LOOP.md` §6](../LOOP.md) for the full runner reference.

> **Token note:** loops run until the goal is met, which can be minutes or hours — judge
> loops especially. Set a budget, prefer convergent goals, and keep a verifiable floor under
> any taste loop. (See the Loop Library caveat in [`../LOOP.md`](../LOOP.md).)

---

## The catalog — every loop

Grouped by the five categories. **Goal kind** is how the loop decides it's done; **Trigger**
is how it starts. Linked names have a detailed per-loop file in [Detailed loops](#detailed-loops).

### Engineering (20)

| Loop | Goal kind | Trigger | One-line objective |
| --- | --- | --- | --- |
| [Overnight docs sweep](overnight-docs-sweep.md) | LLM-judge | Manual | Comb the codebase and rewrite stale or missing docs until the agent judges them complete. |
| [Architecture satisfaction](architecture-satisfaction.md) | Tests | Manual | Refactor the structure until the test suite stays green and the shape feels right. |
| [Sub-50ms page load](sub-50ms-page-load.md) | Metric | Manual | Optimize a route until measured p75 load drops below 50ms. |
| [Production error sweep](production-error-sweep.md) | Auto + manual | Manual | Pull live errors, reproduce, and fix each until the error stream goes quiet. |
| [100% test coverage](test-coverage-100.md) | Metric | Manual | Add tests until line/branch coverage hits 100%. |
| [Logging coverage](logging-coverage.md) | Review + tests | Manual | Instrument the code with structured logging until every critical path is observable and tested. |
| [Test-suite speed](test-suite-speed.md) | Metric | Manual | Profile and parallelize the suite until total run time clears a wall-clock budget. |
| [Repository cleanup](repository-cleanup.md) | Manual | Manual | Delete dead code, stale branches, and unused deps until the tree is lean. |
| [Stale-safe batch release](stale-safe-batch-release.md) | Auto | Manual | Rebase, re-test, and batch-merge a backlog of stale PRs without breaking main. |
| [Ticket-to-PR-ready](ticket-to-pr-ready.md) | Review | Action | Turn a ticket into a reviewed, test-covered PR that's ready to land. |
| [Clodex adversarial review](clodex-adversarial-review.md) | Auto | Manual | Have a second agent attack the diff until it can no longer find a defect. |
| [Five-minute repo maintainer](five-minute-repo-maintainer.md) | CI | Scheduled | Run a quick recurring janitor pass (lint, deps, flaky tests) on every CI tick. |
| [Propagation compliance](propagation-compliance.md) | Search | Action | Find every copy of a pattern and propagate a change until no stale instances remain. |
| [Housekeeper](housekeeper.md) | Auto + manual | Manual | Continuously tidy formatting, imports, and naming until the repo matches its conventions. |
| [Prepare a new project](prepare-a-new-project.md) | Reviewer | Manual | Scaffold a fresh project to a reviewed, ready-to-build baseline. |
| [Test stabilizer](test-stabilizer.md) | Repeat-runs | Manual | Re-run the suite many times and fix flakes until it passes consistently. |
| [Cold-load trimmer](cold-load-trimmer.md) | Bytes | Manual | Trim the cold-start bundle until it's under a byte budget. |
| [Pixel-safe CSS trim](pixel-safe-css-trim.md) | Pixel-identical | Manual | Remove dead CSS until the rendered page is byte-lighter but pixel-identical. |
| [Autonomy builder-reviewer](autonomy-builder-reviewer.md) | Tests | Manual | Pair a builder agent with a reviewer agent that loops until tests pass and the reviewer signs off. |
| [Accessibility repair](accessibility-repair.md) | Standards | Manual | Fix a11y issues until the page meets WCAG/standards checks. |

### Evaluation (11)

| Loop | Goal kind | Trigger | One-line objective |
| --- | --- | --- | --- |
| [Quality streak](quality-streak.md) | Pass/fail | Manual | Run the quality gate repeatedly until it passes N times in a row. |
| [Full product evaluation](full-product-evaluation.md) | Rubric | Manual | Score the whole product against a rubric and improve it until the score clears the bar. |
| [Loop-harness verification](loop-harness-verification.md) | LLM-judge | Scheduled | Periodically prove the loop harness itself still works end-to-end. |
| [Self-improving champion](self-improving-champion.md) | Metric | Manual | Keep a champion solution and only swap it when a challenger beats its metric. |
| [Multi-LLM convergence](multi-llm-convergence.md) | Dual-approval | Manual | Iterate until two independent models both approve the same answer. |
| [Promise-to-proof](promise-to-proof.md) | Evidence | Manual | Force every claim in the work to be backed by executable evidence before it's accepted. |
| [Codex completion contract](codex-completion-contract.md) | LLM-judge | Manual | Loop until an external Codex reviewer agrees the contract is fully satisfied. |
| [Revolve versioned experiment](revolve-versioned-experiment.md) | Baseline | Manual | Run versioned experiments and keep only those that beat the recorded baseline. |
| [Recent feedback sweep](recent-feedback-sweep.md) | Audit | Manual | Audit recent user/agent feedback and resolve each item until the backlog is clear. |
| [Axelrod subagent arena](axelrod-subagent-arena.md) | Tournament | Manual | Run subagents in a round-robin tournament and promote the strategy that wins. |
| [Artifact-to-skill](artifact-to-skill.md) | Independent-apply | Manual | Distill a one-off artifact into a reusable skill, verified by applying it independently. |

### Operations (5)

| Loop | Goal kind | Trigger | One-line objective |
| --- | --- | --- | --- |
| [Nightly changelog](nightly-changelog.md) | Review | Scheduled | Generate a reviewed changelog from each night's merged work. |
| [Post-release baseline](post-release-baseline.md) | Metric | Scheduled | Capture fresh post-release metrics as the new baseline after every ship. |
| [Customer AI deployment](customer-ai-deployment.md) | Metrics | Manual | Roll out a customer-facing AI change and loop until its metrics hold steady. |
| [Production data cleanup](production-data-cleanup.md) | Review | Manual | Find and remediate bad production data, with each fix reviewed before it lands. |
| [Repository maintainer](repository-maintainer.md) | CI | Scheduled | Keep a repo healthy on a schedule — deps, security, hygiene — gated by CI. |

### Content (3)

| Loop | Goal kind | Trigger | One-line objective |
| --- | --- | --- | --- |
| [SEO / GEO visibility](seo-geo-visibility.md) | Audit | Manual | Audit and improve a page until it ranks for search and answer-engine visibility. |
| [Product-update podcast](product-update-podcast.md) | Review | Scheduled | Turn each release into a reviewed product-update podcast episode. |
| [Infinite clickbait thumbnail](infinite-clickbait-thumbnail.md) | Visual-rubric | Manual | Generate thumbnails and iterate until one clears a visual-appeal rubric. |

### Design (7)

| Loop | Goal kind | Trigger | One-line objective |
| --- | --- | --- | --- |
| [Boeing 747 benchmark](boeing-747-benchmark.md) | Visual | Manual | Rebuild a reference design until it visually matches the benchmark target. |
| [War-loops frontend reconstruction](war-loops-frontend-reconstruction.md) | Visual | Manual | Reconstruct a frontend from a screenshot until it matches pixel for pixel. |
| [Devil's advocate](devils-advocate.md) | LLM-judge | Manual | Critique the design from an adversarial stance and fix until the critic relents. |
| [Fresh clone](fresh-clone.md) | Reproducible | Manual | Verify the project builds and runs cleanly from a fresh clone, every time. |
| [Goal forge](goal-forge.md) | Review | Manual | Turn a vague intent into a sharp, reviewed, verifiable goal definition. |
| [UI/UX score](ui-ux-score.md) | Visual + interaction | Manual | Score look and feel, then iterate until both visual and interaction marks clear the bar. |
| [Easy onboarding](easy-onboarding.md) | Reproducible | Manual | Polish the first-run flow until a new user reaches value in a reproducible, timed path. |

---

## Detailed loops

**Every loop in the catalog above now has a full per-loop file** — front-matter (trigger,
goal kind, category), the stopping condition spelled out, and a copy-pasteable prompt ported
verbatim from the [Loop Library](https://signals.forwardfuture.ai/loop-library/) (a handful
without a published prompt block carry a faithful adaptation, flagged in their `source:`
line). Click any loop name in the tables above to open its file. Start here:

- **[fix-issues-qa.md](fix-issues-qa.md)** — the flagship: file a bug from your phone, the
  agent fixes the real code, passes the verifiable test gate **and** an LLM-judge
  satisfaction bar, then posts a before/after card for you to verify.
- **[sub-50ms-page-load.md](sub-50ms-page-load.md)** — optimize a route until measured p75
  load drops under 50ms.
- **[overnight-docs-sweep.md](overnight-docs-sweep.md)** — comb the codebase overnight and
  rewrite stale or missing docs until judged complete.
- **[architecture-satisfaction.md](architecture-satisfaction.md)** — refactor structure
  until the tests stay green and the shape is right.
- **[logging-coverage.md](logging-coverage.md)** — instrument critical paths with structured
  logging until they're observable and tested.
- **[production-error-sweep.md](production-error-sweep.md)** — pull live errors, reproduce,
  and fix until the error stream goes quiet.
- **[seo-geo-visibility.md](seo-geo-visibility.md)** — audit and improve a page for search
  and answer-engine (GEO) visibility.
- **[full-product-evaluation.md](full-product-evaluation.md)** — score the whole product
  against a rubric and improve until it clears the bar.

The other 38 loops in the catalog are ported in full too — open them from the category
tables above.
