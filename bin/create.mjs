#!/usr/bin/env node
// snapfix — the setup CLI. Headline one-liner:
//
//     npx github:OWNER/snapfix init [flags]
//
// Stands up a screenshot-to-AI-fix QA board for ANY project, using GitHub as
// the only backend: one PUBLIC repo (the static board, served via GitHub
// Pages) + one PRIVATE repo (the token-gated screenshot store). It also
// installs the "fix-issues" Claude Code skill into the app repo so an agent
// can read filed issues, fix the real code, recapture proof, and post
// before/after cards.
//
// Design constraints (load-bearing):
//   - ZERO runtime npm deps. Node builtins only; git + gh are driven via
//     child_process with explicit argument arrays (never shell string concat,
//     so paths with spaces and Windows backslashes are safe).
//   - PRIVACY: screenshots NEVER touch the public repo — not even transiently.
//     This CLI therefore creates NO image files in the public board repo. It
//     only ever writes metadata (issues.json) + the static board files.
//   - IDEMPOTENT: re-running `init` is safe. Every step probes for "already
//     exists" and continues rather than failing.
//   - Windows + POSIX friendly: path.join everywhere, no bash-isms.
//
// gh CLI is the auth mechanism for this CLI; the browser board uses a
// fine-grained PAT pasted into localStorage (walkthrough printed at the end).

import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  cpSync,
  rmSync,
  readdirSync,
} from "node:fs";
import {
  resolve,
  dirname,
  join,
  basename,
} from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";

// Auto-setup helpers (zero-dep local modules). These power the one-line
// autonomous setup: copy the app's design language, recommend project-relevant
// loops, auto-tune the loop config, and seed a demo issue. See LOOP.md.
import { extractTheme } from "./lib/theme.mjs";
import { buildCatalog, selectLoops, recommendedLoopsMarkdown } from "./lib/loops.mjs";
import { resolveTick, resolveTrigger, resolveViewport, tuneSatisfaction } from "./lib/tune.mjs";
import { buildDemoIssue, seedDemoIssue, isDemoIssue } from "./lib/demo-issue.mjs";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// This file lives at <snapfix>/bin/create.mjs; product root is one level up.
const PRODUCT_ROOT = resolve(__dirname, "..");
const TEMPLATE_DIR = join(PRODUCT_ROOT, "template");
// Every skill dir under here (each containing a SKILL.md) is installed into the
// app — fix-issues (the loop) + caveman (terse mode) + any others we bundle.
const SKILLS_DIR = join(PRODUCT_ROOT, "skill");
// The Loop Library catalog — recommended playbooks are copied from here.
const LOOPS_DIR = join(PRODUCT_ROOT, "loops");

// ---------------------------------------------------------------------------
// Console helpers — simple unicode prefixes, no chalk dependency.
// ---------------------------------------------------------------------------

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};
// Only colorize when stdout is a TTY (avoids escape-code noise in CI logs).
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (useColor ? code + s + C.reset : s);

const ok = (m) => console.log(`${paint(C.green, "✓")} ${m}`);
const step = (m) => console.log(`${paint(C.cyan, "→")} ${m}`);
const info = (m) => console.log(`  ${paint(C.dim, m)}`);
const warn = (m) => console.log(`${paint(C.yellow, "!")} ${m}`);
const fail = (m) => console.error(`${paint(C.red, "✗")} ${m}`);
const heading = (m) => console.log("\n" + paint(C.bold, m));

function die(message, remediationLines = []) {
  fail(message);
  for (const line of remediationLines) console.error("  " + line);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// run(cmd, args) — single choke point for every external process.
// Returns { ok, code, out, err }. Never throws; callers branch on `.ok`.
// `input` (string) is written to stdin when provided.
// ---------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: opts.cwd,
    input: opts.input,
    // `shell:false` (default) keeps us safe from path-with-spaces / injection.
    // Callers may opt into shell:true ONLY for a TRUSTED bare command (e.g. the
    // Windows agent-CLI probe, which must resolve .cmd/.bat/.ps1 npm shims that
    // shell:false can't find) — never with remote/issue input.
    shell: opts.shell === true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error) {
    // ENOENT => binary not installed.
    return { ok: false, code: -1, out: "", err: r.error.message, spawnError: r.error };
  }
  return {
    ok: r.status === 0,
    code: r.status,
    out: (r.stdout || "").trim(),
    err: (r.stderr || "").trim(),
  };
}

// gh api wrapper. method defaults GET. bodyFields is an array of "-f key=val"
// style fields (we pass them through as repeated --field/-F args). Returns the
// raw run() result so callers can inspect HTTP-ish failure text for "already
// exists" handling.
function gh(args, opts = {}) {
  return run("gh", args, opts);
}

// ---------------------------------------------------------------------------
// Tiny interactive prompt (skipped entirely in --yes mode).
// ---------------------------------------------------------------------------

async function prompt(question, fallback) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = fallback ? ` ${paint(C.dim, `[${fallback}]`)} ` : " ";
  const answer = await new Promise((res) =>
    rl.question(`${paint(C.cyan, "?")} ${question}${suffix}`, (a) => res(a))
  );
  rl.close();
  const trimmed = (answer || "").trim();
  return trimmed || fallback || "";
}

// ---------------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes" || a === "-y") args.yes = true;
    else if (a === "--auto" || a === "-A" || a === "--one-line") { args.auto = true; args.yes = true; }
    else if (a === "--no-fix") args.noFix = true;
    else if (a === "--tick") args.tick = argv[++i];
    else if (a === "--trigger") args.trigger = argv[++i];
    else if (a === "--name") args.name = argv[++i];
    else if (a === "--app-repo") args.appRepo = argv[++i];
    else if (a === "--dev-server") args.devServer = argv[++i];
    else if (a === "--owner") args.owner = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a.startsWith("--")) {
      // Tolerate --key=value form too.
      const eq = a.indexOf("=");
      if (eq > -1) {
        const k = a.slice(2, eq);
        const v = a.slice(eq + 1);
        if (k === "name") args.name = v;
        else if (k === "app-repo") args.appRepo = v;
        else if (k === "dev-server") args.devServer = v;
        else if (k === "owner") args.owner = v;
        else if (k === "tick") args.tick = v;
        else if (k === "trigger") args.trigger = v;
        else if (k === "auto" || k === "one-line") { args.auto = true; args.yes = true; }
        else if (k === "no-fix") args.noFix = true;
        else warn(`Unknown flag ignored: ${a}`);
      } else {
        warn(`Unknown flag ignored: ${a}`);
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

const HELP = `
${paint(C.bold, "snapfix")} — screenshot-to-AI-fix QA board, backed entirely by GitHub.

${paint(C.bold, "Usage:")}
  npx github:OWNER/snapfix init [flags]
  npx github:OWNER/snapfix init --auto          ${paint(C.dim, "# the one-line autonomous setup")}

${paint(C.bold, "Flags:")}
  --auto, -A           One-line setup: read the project, copy its design language
                       onto the board, recommend project-relevant loops, auto-tune
                       the loop config, seed a demo issue, and run the loop on it.
                       Implies --yes.
  --tick <seconds>     Watch/action poll cadence (loop.action.pollSeconds)
  --trigger <kind>     Loop trigger: manual | schedule | action
  --no-fix             With --auto: skip the final agent fix of the demo issue
  --name <repo>        Board repo name        (default: <project>-qa)
  --app-repo <path>    Path to the app repo   (default: ".")
  --dev-server <url>   Dev server URL         (auto-detected from framework)
  --owner <login>      GitHub owner (user/org) (default: authenticated user)
  --yes, -y            Non-interactive; accept all detected defaults
  --help, -h           Show this help

${paint(C.bold, "What it does:")}
  1. Creates a PUBLIC board repo + a PRIVATE image repo
  2. Deploys the static board + config to the public repo
  3. Enables GitHub Pages and prints the board URL
  4. Seeds the private repo's images/ directory
  5. Installs the fix-issues + caveman skills + qa.config.json into your app repo

${paint(C.bold, "--auto additionally:")}
  • Copies the app's design language (colors, radius, font) onto the board
  • Recommends project-relevant loops → RECOMMENDED-LOOPS.md + loops/
  • Auto-tunes the loop (trigger, tick duration, satisfaction bar)
  • Seeds a [snapfix demo] test issue on the board, then runs the fix-issues
    loop once against it — it posts a fix if there's a real bug, otherwise it
    replies that the loop works (skip with --no-fix; needs 'claude' on PATH)

Re-running init is safe — every step is idempotent.
Using --owner with an organization requires the gh token to have org access.
`;

// ---------------------------------------------------------------------------
// Framework / dev-server auto-detection from the app repo's package.json.
// ---------------------------------------------------------------------------

const FRAMEWORK_PORTS = {
  vite: 5173,
  next: 3000,
  "react-scripts": 3000,
  cra: 3000,
  "vue-cli": 8080,
  "@vue/cli-service": 8080,
  angular: 4200,
  "@angular/cli": 4200,
  sveltekit: 5173,
  "@sveltejs/kit": 5173,
  svelte: 5173,
};

// Normalized framework label (the value stored in qa.config.json app.framework)
function detectFramework(appRepoPath) {
  const pkgPath = join(appRepoPath, "package.json");
  if (!existsSync(pkgPath)) return { framework: "unknown", port: 3000 };
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    return { framework: "unknown", port: 3000 };
  }
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };
  const scripts = pkg.scripts || {};
  const scriptText = Object.values(scripts).join(" ").toLowerCase();

  // Ordered checks — most specific first (Next/SvelteKit before generic vite).
  if (deps["next"] || scriptText.includes("next ")) return { framework: "next", port: 3000 };
  if (deps["@angular/cli"] || deps["@angular/core"] || scriptText.includes("ng serve"))
    return { framework: "angular", port: 4200 };
  if (deps["@sveltejs/kit"]) return { framework: "sveltekit", port: 5173 };
  if (deps["@vue/cli-service"] || scriptText.includes("vue-cli-service"))
    return { framework: "vue-cli", port: 8080 };
  if (deps["react-scripts"] || scriptText.includes("react-scripts"))
    return { framework: "react-scripts", port: 3000 };
  if (deps["vite"] || scriptText.includes("vite")) return { framework: "vite", port: 5173 };
  if (deps["svelte"]) return { framework: "svelte", port: 5173 };

  return { framework: "unknown", port: 3000 };
}

// ---------------------------------------------------------------------------
// gatherSignals — read the project to drive loop selection + config auto-tune.
// Pure-ish (reads the app repo's fs); deterministic given the tree. Exported
// for unit testing. `theme` is the result of extractTheme() (or null).
// ---------------------------------------------------------------------------
function gatherSignals(appRepoPath, detected, theme) {
  const has = (rel) => existsSync(join(appRepoPath, rel));
  let scripts = {};
  let deps = {};
  try {
    const pkgPath = join(appRepoPath, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      scripts = pkg.scripts || {};
      deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    }
  } catch { /* unparseable package.json → treat as no signals */ }

  // A real test script (not npm's "no test specified" placeholder).
  const testScript = scripts.test || scripts["test:unit"] || "";
  const hasTests =
    !!testScript && !/no test specified/i.test(testScript);

  const isWeb =
    (detected && detected.framework !== "unknown") ||
    has("index.html") ||
    has(join("public", "index.html")) ||
    has(join("src", "index.html"));

  return {
    framework: (detected && detected.framework) || "unknown",
    port: (detected && detected.port) || 3000,
    isWeb: !!isWeb,
    hasTests,
    hasCI: has(join(".github", "workflows")),
    hasDesignTokens: !!(theme && theme.source && theme.source !== "none"),
    hasDocs: has("README.md") || has("docs"),
    hasTypeScript: has("tsconfig.json"),
    desktop: !!(deps.electron || deps["@electron/remote"]),
  };
}

// ---------------------------------------------------------------------------
// Preflight — git + gh present and authenticated. Returns the owner login.
// ---------------------------------------------------------------------------

function preflight() {
  heading("Preflight");

  const gitV = run("git", ["--version"]);
  if (!gitV.ok) {
    die("git is not installed (or not on PATH).", [
      "Install Git: https://git-scm.com/downloads",
    ]);
  }
  ok(`git found — ${gitV.out}`);

  const ghV = run("gh", ["--version"]);
  if (!ghV.ok) {
    die("GitHub CLI (gh) is not installed (or not on PATH).", [
      "Install gh:   https://cli.github.com/",
      "Then run:     gh auth login",
    ]);
  }
  ok(`gh found — ${ghV.out.split("\n")[0]}`);

  const authStatus = run("gh", ["auth", "status"]);
  if (!authStatus.ok) {
    die("gh is installed but not authenticated.", [
      "Run:  gh auth login",
      "Make sure the token has the 'repo' and 'workflow' scopes.",
    ]);
  }

  // Token-scope preflight. Classic OAuth tokens expose their scopes via the
  // X-OAuth-Scopes response header; fine-grained tokens do not (they carry
  // per-repo permissions instead). So: warn (non-fatal) only when we can
  // positively read the header AND it lacks `repo` — never hard-fail, since an
  // absent header just means a fine-grained token we can't introspect here.
  const scopesProbe = run("gh", ["api", "-i", "user"]);
  if (scopesProbe.ok) {
    const header = (scopesProbe.out + "\n" + scopesProbe.err)
      .split("\n")
      .find((l) => /^x-oauth-scopes:/i.test(l.trim()));
    if (header) {
      const scopes = header
        .split(":")
        .slice(1)
        .join(":")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!scopes.includes("repo")) {
        warn("Your gh token is missing the 'repo' scope.");
        info("Creating a private repo + enabling Pages needs 'repo' scope (classic)");
        info("or equivalent fine-grained permissions (Contents + Pages: Read/write).");
        info("Add it with:  gh auth refresh -s repo,workflow");
      }
    }
  }

  const who = run("gh", ["api", "user", "--jq", ".login"]);
  if (!who.ok || !who.out) {
    die("Could not determine the authenticated GitHub user.", [
      "Run:  gh auth status   (and re-authenticate if needed)",
      who.err ? "gh said: " + who.err : "",
    ].filter(Boolean));
  }
  const owner = who.out.trim();
  ok(`Authenticated as ${paint(C.bold, owner)}`);
  return owner;
}

// ---------------------------------------------------------------------------
// Repo existence + creation helpers (idempotent).
// ---------------------------------------------------------------------------

function repoExists(owner, repo) {
  const r = gh(["repo", "view", `${owner}/${repo}`, "--json", "name"]);
  return r.ok;
}

// Returns true if created or already exists, false on a hard failure.
function ensureRepo(owner, repo, visibility, description) {
  const slug = `${owner}/${repo}`;
  if (repoExists(owner, repo)) {
    ok(`Repo ${slug} already exists — reusing it.`);
    return true;
  }
  step(`Creating ${visibility} repo ${slug} ...`);
  const args = ["repo", "create", slug, `--${visibility}`];
  if (description) args.push("--description", description);
  const r = gh(args);
  if (r.ok) {
    ok(`Created ${slug}`);
    return true;
  }
  // Race / eventual-consistency: another step or a parallel run made it.
  const combined = (r.err + " " + r.out).toLowerCase();
  if (combined.includes("already exists") || combined.includes("name already exists")) {
    ok(`Repo ${slug} already exists — reusing it.`);
    return true;
  }
  if (repoExists(owner, repo)) {
    ok(`Repo ${slug} now present — reusing it.`);
    return true;
  }
  fail(`Failed to create ${slug}: ${r.err || r.out}`);
  return false;
}

// ---------------------------------------------------------------------------
// Canonical config builders. ALL emitted files agree on these exact keys.
// ---------------------------------------------------------------------------

function buildQaConfig(resolved) {
  const { owner, board, priv, branch, devServer, viewport, framework, authStrategy, tokenKey } = resolved;
  return {
    board: {
      owner,
      // The private screenshot repo is ALWAYS created; never empty.
      repo: board,
      private: priv,
      branch,
    },
    app: {
      // Path to the app repo RELATIVE TO THIS CONFIG FILE'S LOCATION. The
      // canonical copy ships into the app repo root (installIntoApp), where
      // the config sits beside the app — so "." (the app IS here). The board
      // repo also gets a copy, but tooling reads the app-repo copy; the board
      // copy is informational and uses the same "." meaning.
      repo: ".",
      devServer,
      viewport,
      framework,
      // Design tokens lifted from the app (--auto) so the board matches its
      // look. null when not extracted. Mirrored into config.js for the board.
      theme: resolved.theme || null,
    },
    reproduce: {
      tool: "playwright",
      recaptureCmd: "node recapture.mjs {route} {out}",
    },
    auth: {
      strategy: authStrategy,
      tokenKey,
      loginUrl: "/",
    },
    // The fix-issues loop = trigger + goal (see LOOP.md). Static loop config
    // lives here; the live, board-adjustable satisfaction knob lives in the
    // board repo's data/loop.json (which overrides loop.goal.satisfaction).
    loop: {
      // How this board's fix loop is kicked: manual | schedule | action.
      // --auto tunes this from the project; otherwise "manual".
      trigger: resolved.trigger || "manual",
      schedule: {
        // Cadence for the schedule trigger and the agent command the runner
        // (tools/loop.mjs) shells out to. Bring-your-own-agent; no cloud.
        cron: resolved.cron || "0 9 * * *",
        agentCmd: 'claude -p "/fix-issues"',
      },
      action: {
        // Event the action trigger watches for, and how often it polls (the
        // "tick duration"; --tick / auto-tuned).
        on: "new-issue",
        pollSeconds: Number.isFinite(Number(resolved.pollSeconds)) ? Number(resolved.pollSeconds) : 60,
      },
      goal: {
        // LLM-as-judge bar (0–100) a fix must clear to post. data/loop.json
        // overrides this live from the board's satisfaction slider.
        satisfaction: Number.isFinite(Number(resolved.satisfaction)) ? Number(resolved.satisfaction) : 80,
        // Verifiable gate: the app test suite must pass (and coverage clear the
        // threshold) before a fix may be posted. coverage:0 disables coverage.
        tests: {
          required: true,
          command: detectTestCommand(resolved.appRepoPath),
          coverage: 0,
        },
      },
      // Project-relevant loops from the Loop Library (--auto). Each:
      // { slug, title, why }. The full playbooks ship into the app's loops/.
      recommended: Array.isArray(resolved.recommended) ? resolved.recommended : [],
    },
  };
}

// Best-effort detection of the app's test command from its package.json. Falls
// back to "npm test" (npm always defines a `test` script slot). Pure + exported
// for unit testing.
function detectTestCommand(appRepoPath) {
  try {
    const pkgPath = join(appRepoPath || ".", "package.json");
    if (!existsSync(pkgPath)) return "npm test";
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const scripts = pkg.scripts || {};
    if (scripts.test) return "npm test";
    if (scripts["test:unit"]) return "npm run test:unit";
    return "npm test";
  } catch {
    return "npm test";
  }
}

// Live loop settings file seeded into the board repo. Browser-writable via the
// GitHub contents API (like data/issues.json) so the satisfaction slider can
// update it without a redeploy. Reads fall back to qa.config.json loop.goal.
function buildLoopJson(resolved) {
  return {
    version: 1,
    satisfaction: resolved.satisfaction ?? 80,
    testGate: true,
    updatedAt: null,
    updatedBy: null,
  };
}

// config.js for the BOARD repo. Read by index.html as window.QA_CONFIG.
// (Board auto-detects from the Pages URL if this file is ever absent, but we
// always write it so custom domains / file:// viewing work too.)
function buildConfigJs(resolved) {
  const { owner, board, priv, branch, title } = resolved;
  const cfg = {
    owner,
    repo: board,
    // Private screenshot repo is always created — never empty.
    privateRepo: priv,
    branch,
    title,
    // Design tokens copied from the app (--auto). The board's applyTheme()
    // maps these onto its CSS variables. null = keep the board's own theme.
    theme: resolved.theme || null,
  };
  return (
    "// Auto-generated by `snapfix init`. Read by index.html as window.QA_CONFIG.\n" +
    "// Safe to edit for a custom domain or a renamed repo; keys must match the\n" +
    "// board's expectations: { owner, repo, privateRepo, branch, title, theme }.\n" +
    "window.QA_CONFIG = " +
    JSON.stringify(cfg, null, 2) +
    ";\n"
  );
}

const BOARD_GITIGNORE =
  "# snapfix board repo — never commit screenshots or local overrides here.\n" +
  "tmp/\n" +
  "qa.config.local.json\n" +
  "node_modules/\n" +
  ".DS_Store\n";

// True if any data/archive-*.json under `boardDir` already holds the demo
// issue — i.e. the user completed (resolved) it. Used so re-running init --auto
// doesn't resurrect a finished demo as a fresh open card. Pure (reads fs);
// exported for unit testing.
function demoAlreadyArchived(boardDir) {
  const dataDir = join(boardDir, "data");
  if (!existsSync(dataDir)) return false;
  let files;
  try { files = readdirSync(dataDir); } catch { return false; }
  for (const f of files) {
    if (!/^archive-\d{4}\.json$/.test(f)) continue;
    try {
      const a = JSON.parse(readFileSync(join(dataDir, f), "utf8"));
      if (Array.isArray(a.issues) && a.issues.some(isDemoIssue)) return true;
    } catch { /* skip an unparseable archive */ }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Step 5 — deploy the board into a temp clone of the public repo.
// ---------------------------------------------------------------------------

function deployBoard(owner, board, resolved) {
  heading("Deploy board");

  // Verify the template assets we copy actually exist in this package.
  const required = [
    join(TEMPLATE_DIR, "index.html"),
    join(TEMPLATE_DIR, "tools", "qa.mjs"),
    join(TEMPLATE_DIR, "data", "issues.json"),
  ];
  for (const f of required) {
    if (!existsSync(f)) {
      die(`Template file missing from the snapfix package: ${f}`, [
        "This indicates a broken/incomplete snapfix install.",
      ]);
    }
  }

  const work = mkdtempSync(join(tmpdir(), "snapfix-board-"));
  step(`Cloning ${owner}/${board} into a temp workspace ...`);
  const clone = gh(["repo", "clone", `${owner}/${board}`, work]);
  if (!clone.ok) {
    rmSync(work, { recursive: true, force: true });
    die(`Could not clone ${owner}/${board}: ${clone.err || clone.out}`);
  }

  try {
    // --- Copy template assets (metadata + static board ONLY; no images). ---
    cpSync(join(TEMPLATE_DIR, "index.html"), join(work, "index.html"));

    mkdirSync(join(work, "tools"), { recursive: true });
    cpSync(join(TEMPLATE_DIR, "tools", "qa.mjs"), join(work, "tools", "qa.mjs"));
    // The loop runner ships beside qa.mjs (the trigger layer — see LOOP.md).
    const loopSrc = join(TEMPLATE_DIR, "tools", "loop.mjs");
    if (existsSync(loopSrc)) cpSync(loopSrc, join(work, "tools", "loop.mjs"));

    mkdirSync(join(work, "data"), { recursive: true });
    // Only seed issues.json if absent — NEVER clobber a board's live issue
    // history on a re-run.
    const issuesDest = join(work, "data", "issues.json");
    if (!existsSync(issuesDest)) {
      cpSync(join(TEMPLATE_DIR, "data", "issues.json"), issuesDest);
    } else {
      info("data/issues.json already present — leaving existing issues intact.");
    }
    // --auto: seed a [snapfix demo] test issue so the board isn't empty and the
    // fix loop has something to act on. Idempotent (seedDemoIssue replaces any
    // existing demo in issues.json) and NEVER clobbers real issues. Also
    // archive-aware: if the user already resolved the demo (it's in an archive),
    // do NOT resurrect it as a fresh open issue on a later re-run.
    if (resolved.auto && resolved.demoIssue) {
      if (demoAlreadyArchived(work)) {
        info("Demo issue already resolved + archived — not re-seeding it.");
      } else {
        let db;
        try { db = JSON.parse(readFileSync(issuesDest, "utf8")); }
        catch { db = { version: 1, issues: [] }; }
        const seeded = seedDemoIssue(db, resolved.demoIssue);
        writeFileSync(issuesDest, JSON.stringify(seeded, null, 2) + "\n");
        ok("Seeded a [snapfix demo] test issue on the board.");
      }
    }
    // Live loop settings (satisfaction slider target). Seed only if absent so a
    // re-run never resets a board owner's tuned satisfaction bar.
    const loopDest = join(work, "data", "loop.json");
    if (!existsSync(loopDest)) {
      writeFileSync(loopDest, JSON.stringify(buildLoopJson(resolved), null, 2) + "\n");
    } else {
      info("data/loop.json already present — leaving existing loop settings intact.");
    }

    // Optional template extras (present once siblings land): copy if available.
    for (const extra of ["recapture.mjs", "README.md", "qa.config.example.json"]) {
      const src = join(TEMPLATE_DIR, extra);
      if (existsSync(src)) cpSync(src, join(work, extra));
    }

    // --- Write generated config (always overwrite — it's derived). ---
    writeFileSync(join(work, "config.js"), buildConfigJs(resolved));
    writeFileSync(
      join(work, "qa.config.json"),
      JSON.stringify(buildQaConfig(resolved), null, 2) + "\n"
    );
    writeFileSync(join(work, ".gitignore"), BOARD_GITIGNORE);

    // Safety assertion: the public board MUST NOT contain any image files.
    // (We never copy any, but assert it so a future template change can't
    //  silently leak screenshots into public history.)
    assertNoImages(work);

    // --- Commit + push to main. ---
    const cfg = { cwd: work };
    // Ensure we're on `main` (gh clones the default branch; normalize the name).
    run("git", ["checkout", "-B", "main"], cfg);

    run("git", ["add", "-A"], cfg);
    const status = run("git", ["status", "--porcelain"], cfg);
    if (!status.out) {
      ok("Board already up to date — nothing to push.");
    } else {
      const commit = run(
        "git",
        ["commit", "-m", "snapfix: deploy board + config"],
        cfg
      );
      if (!commit.ok) {
        // e.g. identity not set — surface a clear remediation.
        const t = (commit.err + commit.out).toLowerCase();
        if (t.includes("please tell me who you are") || t.includes("user.email")) {
          die("git has no commit identity configured.", [
            'Run: git config --global user.email "you@example.com"',
            'Run: git config --global user.name  "Your Name"',
          ]);
        }
        die(`git commit failed: ${commit.err || commit.out}`);
      }
      // Push; if the remote moved under us, rebase and retry once. But only
      // attempt the rebase when the remote actually HAS a `main` branch —
      // `git pull --rebase origin main` dies with "couldn't find remote ref
      // main" against a brand-new empty repo, masking the real push error.
      let push = run("git", ["push", "-u", "origin", "main"], cfg);
      if (!push.ok) {
        const remoteMain = run("git", ["ls-remote", "--heads", "origin", "main"], cfg);
        if (remoteMain.ok && remoteMain.out) {
          run("git", ["pull", "--rebase", "origin", "main"], cfg);
        }
        push = run("git", ["push", "-u", "origin", "main"], cfg);
      }
      if (!push.ok) {
        die(`git push failed: ${push.err || push.out}`);
      }
      ok("Board deployed to main.");
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Guard: refuse to proceed if any image-like file is staged in the board repo.
function assertNoImages(dir) {
  const r = run("git", ["-C", dir, "ls-files", "--others", "--cached", "--exclude-standard"]);
  const files = (r.out || "").split("\n").filter(Boolean);
  const imageRe = /\.(png|jpe?g|gif|webp|bmp|avif|heic|tiff?)$/i;
  const offenders = files.filter((f) => imageRe.test(f));
  if (offenders.length) {
    die("PRIVACY GUARD: image file(s) would be committed to the PUBLIC board repo.", [
      "Screenshots must only ever live in the private repo.",
      "Offending files: " + offenders.join(", "),
    ]);
  }
}

// ---------------------------------------------------------------------------
// Step 6 — enable GitHub Pages (main / root). 409/422 == already enabled.
// ---------------------------------------------------------------------------

// Blocking sleep (no deps; spawnSync is synchronous so this keeps the linear
// flow). Used between Pages-enable retries to let the just-pushed ref propagate.
function sleepMs(ms) {
  const r = spawnSync(process.execPath, ["-e", `setTimeout(()=>{}, ${ms})`], {
    timeout: ms + 5000,
  });
  // Fallback to a busy-wait only if spawning node failed (shouldn't happen).
  if (r.error) {
    const end = Date.now() + ms;
    while (Date.now() < end) {/* spin */}
  }
}

function pagesEnabled(owner, board) {
  return gh(["api", `repos/${owner}/${board}/pages`]).ok;
}

function enablePages(owner, board) {
  heading("Enable GitHub Pages");

  // Probe current state first (cheap + clarifies the "already enabled" path).
  if (pagesEnabled(owner, board)) {
    ok("GitHub Pages already enabled.");
    return;
  }

  step("Requesting Pages build (branch=main, path=/) ...");

  // The POST right after the first push can 422 ("branch not found") due to
  // ref-propagation lag. Retry up to 3 times, re-probing/re-POSTing with a
  // short delay between attempts before falling back to the manual warning.
  const MAX_ATTEMPTS = 3;
  let lastResult = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const r = gh([
      "api",
      `repos/${owner}/${board}/pages`,
      "-X",
      "POST",
      "-f",
      "source[branch]=main",
      "-f",
      "source[path]=/",
    ]);
    lastResult = r;
    if (r.ok) {
      ok("GitHub Pages enabled.");
      return;
    }
    const t = (r.err + " " + r.out).toLowerCase();
    // 409 Conflict / 422 Unprocessable => already enabled or just-now created.
    // Re-probe to confirm (idempotent: an already-enabled site is success).
    const looks4xx =
      t.includes("409") ||
      t.includes("422") ||
      t.includes("already exists") ||
      t.includes("pages site already") ||
      t.includes("http 4");
    if (looks4xx && pagesEnabled(owner, board)) {
      ok("GitHub Pages already enabled.");
      return;
    }
    // Not yet enabled. If we have attempts left, wait for ref propagation and
    // retry the whole probe+POST cycle.
    if (attempt < MAX_ATTEMPTS) {
      info(`Pages not ready yet (attempt ${attempt}/${MAX_ATTEMPTS}); retrying ...`);
      sleepMs(2000);
      // A retry can also win because the site finished provisioning meanwhile.
      if (pagesEnabled(owner, board)) {
        ok("GitHub Pages enabled.");
        return;
      }
    }
  }

  // All retries failed — non-fatal: the board still works once the user
  // enables Pages by hand.
  const r = lastResult || { err: "", out: "" };
  warn(`Could not auto-enable Pages: ${r.err || r.out}`);
  info(`Enable it manually: https://github.com/${owner}/${board}/settings/pages`);
  info("Set Source = Deploy from a branch, Branch = main, Folder = / (root).");
}

// ---------------------------------------------------------------------------
// Step 7 — seed the private repo's images/ directory with a .gitkeep.
// Uses the contents API directly (no clone needed). Idempotent: skips if the
// file already exists.
// ---------------------------------------------------------------------------

function seedPrivateRepo(owner, priv) {
  heading("Seed private image repo");

  const path = "images/.gitkeep";
  const exists = gh(["api", `repos/${owner}/${priv}/contents/${path}`]);
  if (exists.ok) {
    ok(`Private repo already initialized (${path} present).`);
    return;
  }

  step(`Creating ${path} in ${owner}/${priv} ...`);
  // Base64 of a tiny placeholder. The contents API requires base64 content.
  const content = Buffer.from(
    "snapfix private image store — screenshots are uploaded here via the GitHub API.\n"
  ).toString("base64");
  const r = gh([
    "api",
    `repos/${owner}/${priv}/contents/${path}`,
    "-X",
    "PUT",
    "-f",
    "message=snapfix: initialize private image store",
    "-f",
    `content=${content}`,
    "-f",
    "branch=main",
  ]);
  if (r.ok) {
    ok("Private repo image store initialized.");
    return;
  }
  const t = (r.err + " " + r.out).toLowerCase();
  if (t.includes("already exists") || t.includes("422")) {
    ok("Private repo already initialized.");
    return;
  }
  warn(`Could not seed private repo: ${r.err || r.out}`);
  info("Non-fatal — the first uploaded screenshot will create images/ anyway.");
}

// ---------------------------------------------------------------------------
// Step 8 — install the skill + qa.config.json into the app repo.
// ---------------------------------------------------------------------------

function installIntoApp(appRepoPath, resolved) {
  heading("Install into app repo");

  // qa.config.json — the canonical config the skill + tools/qa.mjs read.
  const cfgDest = join(appRepoPath, "qa.config.json");
  const cfgJson = JSON.stringify(buildQaConfig(resolved), null, 2) + "\n";
  if (existsSync(cfgDest)) {
    // Overwrite — config is derived and re-running init is the way to update
    // it. (Local-only overrides belong in qa.config.local.json, gitignored.)
    info("qa.config.json exists — updating it with the resolved config.");
  }
  writeFileSync(cfgDest, cfgJson);
  ok(`Wrote ${cfgDest}`);

  // Install EVERY bundled skill (fix-issues, caveman, …) into .claude/skills/.
  installSkills(appRepoPath);

  // --auto: drop the project-relevant loop playbooks + an index into the app.
  if (resolved.auto && Array.isArray(resolved.recommended) && resolved.recommended.length) {
    installRecommendedLoops(appRepoPath, resolved);
  }
}

// Copy each bundled skill dir (SKILLS_DIR/<name>/SKILL.md + siblings like
// LICENSE) into <app>/.claude/skills/<name>/. Never clobbers a customized
// SKILL.md — writes the new one as a sidecar and flags it instead.
function installSkills(appRepoPath) {
  if (!existsSync(SKILLS_DIR)) {
    warn("No bundled skills found in this snapfix package (skill/ missing).");
    return;
  }
  let entries;
  try { entries = readdirSync(SKILLS_DIR, { withFileTypes: true }); }
  catch { entries = []; }
  const skills = entries.filter((e) => e.isDirectory() && existsSync(join(SKILLS_DIR, e.name, "SKILL.md")));
  if (!skills.length) {
    warn("No installable skills under skill/ (each needs a SKILL.md).");
    return;
  }
  for (const e of skills) {
    const srcDir = join(SKILLS_DIR, e.name);
    const destDir = join(appRepoPath, ".claude", "skills", e.name);
    const destSkill = join(destDir, "SKILL.md");
    mkdirSync(destDir, { recursive: true });
    if (existsSync(destSkill)) {
      const sidecar = join(destDir, "SKILL.snapfix-new.md");
      cpSync(join(srcDir, "SKILL.md"), sidecar);
      warn(`Skill "${e.name}" already exists; left it untouched.`);
      info(`Wrote the latest version next to it: ${sidecar}`);
    } else {
      // Copy the whole skill dir so LICENSE/assets travel with SKILL.md.
      cpSync(srcDir, destDir, { recursive: true });
      ok(`Installed skill → ${destDir}`);
    }
  }
}

// --auto: write RECOMMENDED-LOOPS.md and copy the selected loop playbooks into
// <app>/loops/ so the project-relevant loops live with the code.
function installRecommendedLoops(appRepoPath, resolved) {
  const project = resolved.title ? resolved.title.replace(/ QA$/, "") : "your project";
  const md = recommendedLoopsMarkdown(resolved.recommended, { project, catalog: resolved.catalog });
  writeFileSync(join(appRepoPath, "RECOMMENDED-LOOPS.md"), md);
  ok("Wrote RECOMMENDED-LOOPS.md (project-relevant loops).");

  const destLoops = join(appRepoPath, "loops");
  mkdirSync(destLoops, { recursive: true });
  let copied = 0;
  for (const r of resolved.recommended) {
    const src = join(LOOPS_DIR, `${r.slug}.md`);
    if (existsSync(src)) { cpSync(src, join(destLoops, `${r.slug}.md`)); copied++; }
  }
  if (copied) ok(`Copied ${copied} loop playbook${copied === 1 ? "" : "s"} → ${destLoops}`);
}

// --auto final step: run the agent once to fix the seeded demo issue. The agent
// command is the same one the loop runner uses. Non-fatal + clearly guarded:
// if the agent CLI isn't on PATH we print the command instead of failing setup.
function runAgentFix(appRepoPath, agentCmd) {
  heading("Fix the demo issue (fix-issues loop)");
  // agentCmd is like: claude -p "/fix-issues". Split off the binary to probe it.
  const bin = (agentCmd.match(/^\s*(\S+)/) || [])[1] || "claude";
  // On Windows the agent CLI is commonly an npm shim (claude.cmd/.ps1, no .exe);
  // spawn with shell:false can't resolve those, so probe through the shell on
  // win32. `bin` is split from our own trusted agentCmd — no injection risk.
  const probe = run(bin, ["--version"], { shell: process.platform === "win32" });
  if (!probe.ok) {
    warn(`'${bin}' CLI not found on PATH — skipping the automatic fix.`);
    info(`Run it yourself from the app repo:  ${agentCmd}`);
    return;
  }
  step(`Invoking the agent: ${paint(C.bold, agentCmd)}`);
  info(`(cwd: ${appRepoPath})`);
  // Inherit stdio so the user watches the agent work live. shell:true — agentCmd
  // is OUR config string (trusted), like a cron line; never issue/remote input.
  const r = spawnSync(agentCmd, { cwd: appRepoPath, stdio: "inherit", shell: true });
  if (r.error) { warn(`Could not run the agent: ${r.error.message}`); return; }
  if (r.status === 0) ok("Agent run complete — open the board to see what it did (a proposed fix, a reply, or the issue left open).");
  else warn(`Agent exited ${r.status}. Re-run when ready:  ${agentCmd}`);
}

// ---------------------------------------------------------------------------
// Step 9 — final summary + the exact PAT walkthrough.
// ---------------------------------------------------------------------------

function finalSummary(resolved) {
  const { owner, board, priv, boardUrl, appRepoRel, auto, theme, recommended, trigger, pollSeconds } = resolved;
  const repoUrl = (r) => `https://github.com/${owner}/${r}`;
  const sep = paint(C.dim, "─".repeat(60));

  heading("🎉 snapfix is set up");
  console.log(sep);
  console.log(`  ${paint(C.bold, "Board")}        ${paint(C.cyan, boardUrl)}`);
  console.log(`  ${paint(C.bold, "Owner")}        ${owner}`);
  console.log(`  ${paint(C.bold, "Board repo")}   ${repoUrl(board)} (public)`);
  console.log(`  ${paint(C.bold, "Image repo")}   ${repoUrl(priv)} (private)`);
  console.log(`  ${paint(C.bold, "App repo")}     ${appRepoRel}`);
  console.log(sep);

  if (auto) {
    console.log(`  ${paint(C.bold, "Theme")}        ${theme && theme.source !== "none" ? "copied from the app (" + theme.source + ")" : "board default (no app tokens found)"}`);
    console.log(`  ${paint(C.bold, "Loop")}         trigger=${trigger} · tick=${pollSeconds}s`);
    console.log(`  ${paint(C.bold, "Loops")}        ${(recommended || []).map((r) => r.slug).join(", ") || "—"}  ${paint(C.dim, "(RECOMMENDED-LOOPS.md + loops/)")}`);
    console.log(`  ${paint(C.bold, "Demo issue")}   seeded "[snapfix demo]" on the board`);
    console.log(`  ${paint(C.bold, "Skills")}       fix-issues + caveman → .claude/skills/`);
    console.log(sep);
  }

  console.log(paint(C.dim, "  Note: GitHub Pages can take ~1 minute to go live on first deploy."));
  console.log(paint(C.dim, "  Org repos require the gh token to have org access.\n"));

  heading("1. Create a fine-grained Personal Access Token (PAT)");
  console.log("  The board writes issues + screenshots straight from your browser,");
  console.log("  so it needs a token with write access to BOTH repos:");
  console.log("");
  console.log("    a. GitHub → Settings → Developer settings →");
  console.log("       Fine-grained tokens → " + paint(C.bold, "Generate new token"));
  console.log("    b. Repository access → " + paint(C.bold, "Only select repositories") + " → choose:");
  console.log("         • " + `${owner}/${board}`);
  console.log("         • " + `${owner}/${priv}`);
  console.log("    c. Permissions → Repository permissions →");
  console.log("         • Contents → " + paint(C.bold, "Read and write"));
  console.log("    d. Generate, then copy the token (starts with github_pat_…).");

  heading("2. Open the board and paste the token");
  console.log("    a. Open " + paint(C.cyan, boardUrl));
  console.log("    b. Paste the PAT into the token field (stored in your browser's");
  console.log("       localStorage only — never committed anywhere).");
  console.log("    c. File an issue: pick a route, drop a screenshot, describe the bug.");
  console.log("       (The screenshot uploads to the PRIVATE repo via the API.)");

  heading("3. Fix issues with Claude Code (the fix-issues loop)");
  console.log("  From inside your app repo:");
  console.log("    • Manual trigger:   " + paint(C.bold, "/fix-issues"));
  console.log("    • Or pull the queue manually:");
  console.log("        " + paint(C.bold, "node tools/qa.mjs pull") + "   (run from the board repo clone)");
  console.log("");
  console.log(paint(C.dim, "  The loop reads open issues, fixes the real code, runs your tests"));
  console.log(paint(C.dim, "  (verifiable goal), self-scores the fix against your satisfaction bar"));
  console.log(paint(C.dim, "  (LLM-as-judge goal), then posts before/after cards back to the board."));
  console.log("");

  heading("4. Automate the loop (schedule / action triggers)");
  console.log("  Remove the human from the inner cycle (see LOOP.md):");
  console.log("    • Status:    " + paint(C.bold, "node tools/loop.mjs status"));
  console.log("    • One tick:  " + paint(C.bold, "node tools/loop.mjs run"));
  console.log("    • Watch:     " + paint(C.bold, "node tools/loop.mjs watch") + "   (kick the agent when a new issue lands)");
  console.log("    • Schedule:  " + paint(C.bold, "node tools/loop.mjs schedule") + "   (print the cron / Task Scheduler line)");
  console.log("");
  console.log(paint(C.dim, "  Tune the satisfaction bar live with the slider in the board header."));
  console.log("");
}

// ---------------------------------------------------------------------------
// init command
// ---------------------------------------------------------------------------

async function init(args) {
  // 1. PREFLIGHT
  const authedOwner = preflight();
  // Owner defaults to the authenticated user; --owner targets an org (or a
  // different account) the token has access to. Threaded through every repo op.
  const owner = (args.owner || authedOwner).trim();

  // 2. RESOLVE CONFIG
  heading("Resolve configuration");

  const appRepoRaw = args.appRepo || ".";
  const appRepoPath = resolve(process.cwd(), appRepoRaw);
  if (!existsSync(appRepoPath)) {
    die(`--app-repo path does not exist: ${appRepoPath}`);
  }
  // The app repo lives one level up from the board repo clone in normal use;
  // we store the path the user passed (relative-friendly) so qa.config.json
  // app.repo points back at the app from the board. Default ".." matches the
  // canonical schema (board repo is a sibling of the app repo).
  const appRepoRel = appRepoRaw === "." ? ".." : appRepoRaw;

  const project = basename(appRepoPath) || basename(process.cwd());

  // Board + private repo names.
  let board = args.name || `${project}-qa`;
  if (!args.yes && !args.name) {
    board = sanitizeRepoName(await prompt("Board repo name?", board));
  } else {
    board = sanitizeRepoName(board);
  }
  // The private screenshot repo is ALWAYS created — screenshots must never be
  // public, so there is no opt-out. priv is always a real repo name.
  const priv = `${board}-private`;

  // Framework + dev server detection.
  const detected = detectFramework(appRepoPath);
  let devServer =
    args.devServer ||
    `http://localhost:${detected.port}`;
  if (!args.yes && !args.devServer) {
    devServer = await prompt(
      `Dev server URL? (framework: ${detected.framework})`,
      devServer
    );
  }

  // Read the project: lift its design language + gather signals for loop
  // selection and config auto-tuning. Both are best-effort and never throw.
  const theme = extractTheme(appRepoPath);
  const signals = gatherSignals(appRepoPath, detected, theme);

  // Project-relevant loops from the Loop Library (catalog built from loops/).
  let catalog = [];
  try { catalog = buildCatalog(LOOPS_DIR); } catch { catalog = []; }
  const recommended = catalog.length ? selectLoops(signals, catalog) : [];

  const branch = "main";
  const title = `${project} QA`;
  // Default auth strategy is "none" (public routes). The skill + qa.config.json
  // document how to switch to seeded-jwt / manual-otp later.
  const authStrategy = "none";
  const tokenKey = "access_token";

  const boardUrl = `https://${owner}.github.io/${board}/`;

  // Auto-tuned loop knobs. These resolvers give sensible defaults everywhere;
  // --auto / --tick / --trigger refine them (e.g. action+60s tick for web apps).
  const viewport = resolveViewport(signals);
  const pollSeconds = resolveTick(args.tick, signals);
  const trigger = resolveTrigger(args, signals);
  const satisfaction = tuneSatisfaction(signals);

  // --auto seeds a demo issue (stamped now) so the loop has something to fix.
  const demoIssue = args.auto
    ? buildDemoIssue({ owner, route: "/", nowIso: new Date().toISOString(), project })
    : null;

  const resolved = {
    owner,
    board,
    priv,
    branch,
    boardUrl,
    appRepoPath,
    appRepoRel,
    devServer,
    viewport,
    framework: detected.framework,
    title,
    authStrategy,
    tokenKey,
    // LLM-as-judge satisfaction bar (auto-tuned); the board slider tunes it live.
    satisfaction,
    pollSeconds,
    trigger,
    // Auto-setup additions (see lib/*). theme → board re-skin; recommended →
    // project loops; demoIssue → seeded test issue; auto → one-line mode.
    theme,
    recommended,
    catalog,
    signals,
    auto: !!args.auto,
    demoIssue,
  };

  ok(`Project        ${project}`);
  ok(`Owner          ${owner}`);
  ok(`Board repo     ${owner}/${board} (public)`);
  ok(`Private repo   ${owner}/${priv} (private)`);
  ok(`App repo       ${appRepoPath}`);
  ok(`Framework      ${detected.framework}`);
  ok(`Dev server     ${devServer}`);
  ok(`Loop           trigger=${trigger} · tick=${pollSeconds}s · judge≥${satisfaction}`);
  if (theme && theme.source && theme.source !== "none") {
    ok(`Design language copied from ${theme.source}${theme.accent ? `  (accent ${theme.accent})` : ""}`);
  } else {
    info("No app design tokens found — board keeps its default theme.");
  }
  if (recommended.length) ok(`Recommended loops  ${recommended.map((r) => r.slug).join(", ")}`);
  if (args.auto) ok(`Demo issue     seeding "[snapfix demo]" then ${args.noFix ? "skipping the loop" : "running the loop on it"}`);

  if (!args.yes) {
    const go = await prompt("Proceed?", "yes");
    if (!/^y(es)?$/i.test(go)) {
      warn("Aborted by user.");
      process.exit(0);
    }
  }

  heading("Create repos");
  // 3. PUBLIC BOARD REPO
  if (!ensureRepo(owner, board, "public", `${title} — snapfix board`)) {
    die("Cannot continue without the public board repo.");
  }
  // 4. PRIVATE IMAGE REPO — always created; screenshots must never be public.
  if (!ensureRepo(owner, priv, "private", `${title} — snapfix private screenshots`)) {
    die("Cannot continue without the private screenshot repo.", [
      "Screenshots must never be public, so the private repo is required.",
      "Org owners: ensure the gh token has access to create repos in this org.",
      "Then re-run init.",
    ]);
  }

  // 5. DEPLOY THE BOARD
  deployBoard(owner, board, resolved);

  // 6. ENABLE PAGES
  enablePages(owner, board);

  // 7. SEED PRIVATE REPO
  seedPrivateRepo(owner, resolved.priv);

  // 8. INSTALL SKILLS + CONFIG (+ recommended loops in --auto) INTO APP REPO
  installIntoApp(appRepoPath, resolved);

  // 9. --auto: fix the seeded demo issue by running the fix-issues loop once.
  if (resolved.auto && !args.noFix) {
    runAgentFix(appRepoPath, 'claude -p "/fix-issues"');
  }

  // 10. FINAL OUTPUT
  finalSummary(resolved);
}

// GitHub repo names: letters, digits, ., -, _. Spaces → hyphens; strip the rest.
function sanitizeRepoName(name) {
  const clean = String(name || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^[.-]+/, "");
  if (!clean) die(`Invalid repo name after sanitizing: "${name}"`);
  return clean;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  const cmd = args._[0];
  if (!cmd || cmd === "init") {
    try {
      await init(args);
    } catch (e) {
      fail("Unexpected error: " + (e && e.message ? e.message : String(e)));
      if (process.env.SNAPFIX_DEBUG) console.error(e);
      process.exit(1);
    }
    return;
  }

  fail(`Unknown command: ${cmd}`);
  console.log(HELP);
  process.exit(1);
}

// Run unless imported for testing (SNAPFIX_NO_MAIN=1 keeps the module inert so
// the pure helpers — framework detection, config builders — can be unit-tested
// without triggering the network-touching init flow).
if (!process.env.SNAPFIX_NO_MAIN) {
  main();
}

export {
  detectFramework,
  gatherSignals,
  buildQaConfig,
  buildConfigJs,
  buildLoopJson,
  detectTestCommand,
  demoAlreadyArchived,
  sanitizeRepoName,
  parseArgs,
};
