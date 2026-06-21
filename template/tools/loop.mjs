#!/usr/bin/env node
// snapfix loop runner — the TRIGGER layer for the fix-issues loop.
//
//   node tools/loop.mjs status                 show loop config, open count, satisfaction
//   node tools/loop.mjs run [--agent "<cmd>"]   one tick: invoke the agent command once
//   node tools/loop.mjs watch [--interval 60] [--until-empty] [--agent "<cmd>"]
//                                               action/schedule: poll for work, kick the agent
//   node tools/loop.mjs schedule [--cron "0 9 * * *"] [--agent "<cmd>"]
//                                               print the OS-scheduler line to install
//   node tools/loop.mjs verify                  run the VERIFIABLE gate (tests + coverage)
//
// --agent "<cmd>" overrides loop.schedule.agentCmd for this invocation, so any
// loop in the Loop Library (loops/) can ride the same runner without editing
// config — e.g. `run --agent 'claude -p "/logging-coverage"'`.
//
// A loop = trigger + goal (see LOOP.md). This script is the trigger layer; it
// NEVER fixes code itself — it orchestrates the agent (loop.schedule.agentCmd,
// default `claude -p "/fix-issues"`) that does. Bring-your-own-agent, zero cloud
// secrets. The verifiable goal (tests + coverage) is `verify`; the LLM-as-judge
// goal (satisfaction) is enforced inside the agent/skill.
//
// Design constraints (match qa.mjs / recapture.mjs): ZERO npm deps, Node builtins
// only, ESM, Windows + POSIX friendly. Everything is read from qa.config.json.
//
// TRUST NOTE: loop.schedule.agentCmd and loop.goal.tests.command are run through
// the shell. They come from YOUR OWN qa.config.json (the same trust level as a
// cron line or an npm script) — never from issue content or any remote input.
// CAUTION: a copy of qa.config.json also ships in the PUBLIC board repo. Editing
// agentCmd / tests.command THERE (e.g. via a merged PR) and then running the
// loop from the board repo executes that string on your machine — review PRs
// that touch those fields as you would a change to a cron line or npm script.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join, parse as parsePath } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// This script ships at <board repo>/tools/loop.mjs → the board repo is one up.
const BOARD_DIR = resolve(SCRIPT_DIR, "..");

const EXIT = { OK: 0, GOAL_NOT_MET: 1, USAGE: 2, CONFIG: 3 };

// ── tiny console helpers (no deps) ──────────────────────────────────────────
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const C = { reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m" };
const paint = (c, s) => (useColor ? c + s + C.reset : s);
const log = (m = "") => console.log(m);
const ok = (m) => console.log(paint(C.green, "✓ ") + m);
const step = (m) => console.log(paint(C.cyan, "→ ") + m);
const warn = (m) => console.log(paint(C.yellow, "! ") + m);
const fail = (m) => console.error(paint(C.red, "✗ ") + m);

// ── arg parsing ─────────────────────────────────────────────────────────────
const [, , cmd, ...rest] = process.argv;
const flag = (name) => {
  const i = rest.indexOf("--" + name);
  return i > -1 ? rest[i + 1] : undefined;
};
const has = (name) => rest.includes("--" + name);

// ── config resolution ───────────────────────────────────────────────────────
// Prefer the config found by walking up from cwd (the APP repo when you run the
// loop there — its app.repo "." correctly points at the app). Fall back to the
// board repo's copy that ships beside this script.
function findConfigPath() {
  let dir = process.cwd();
  for (let i = 0; i < 64; i++) {
    const candidate = join(dir, "qa.config.json");
    if (existsSync(candidate)) return candidate;
    const parent = parsePath(dir).dir || dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const boardCopy = join(BOARD_DIR, "qa.config.json");
  if (existsSync(boardCopy)) return boardCopy;
  return null;
}

function loadConfig() {
  const path = findConfigPath();
  if (!path) {
    fail("qa.config.json not found (walked up from " + process.cwd() + " and checked " + BOARD_DIR + ").");
    log("  Set up snapfix first:  npx github:OWNER/snapfix init");
    process.exit(EXIT.CONFIG);
  }
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail("qa.config.json is not valid JSON (" + path + "): " + e.message);
    process.exit(EXIT.CONFIG);
  }
  return { cfg, path };
}

// Defaults make every field safe to read even on a pre-loop config.
function loopConfig(cfg) {
  const loop = cfg.loop || {};
  const schedule = loop.schedule || {};
  const action = loop.action || {};
  const goal = loop.goal || {};
  const tests = goal.tests || {};
  return {
    trigger: loop.trigger || "manual",
    cron: schedule.cron || "0 9 * * *",
    agentCmd: schedule.agentCmd || 'claude -p "/fix-issues"',
    actionOn: action.on || "new-issue",
    pollSeconds: Number(action.pollSeconds) || 60,
    satisfaction: Number.isFinite(Number(goal.satisfaction)) ? Number(goal.satisfaction) : 80,
    testsRequired: tests.required !== false,
    testCommand: tests.command || "npm test",
    coverage: Number(tests.coverage) || 0,
  };
}

// Per-invocation agent override: `--agent "<cmd>"` wins over the configured
// loop.schedule.agentCmd. Lets any catalog loop ride the runner without editing
// config. Pure + exported so the override contract is unit-tested.
function agentCmdFor(lc, override) {
  return override && override.trim() ? override : lc.agentCmd;
}

// The directory the app + its tests live in: app.repo resolved against the
// config file's location. (In the app-repo copy, app.repo === "." → the app root.)
function appDir(cfg, configPath) {
  const rel = (cfg.app && cfg.app.repo) || ".";
  return resolve(dirname(configPath), rel);
}

// ── board state (open issues, live satisfaction) ────────────────────────────
function gitPullBoard(branch = "main") {
  const r = spawnSync("git", ["pull", "--rebase", "origin", branch], { cwd: BOARD_DIR, encoding: "utf8" });
  return r.status === 0;
}

function readBoardJson(rel) {
  const p = join(BOARD_DIR, rel);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

function openIssues() {
  const db = readBoardJson(join("data", "issues.json"));
  if (!db || !Array.isArray(db.issues)) return [];
  return db.issues.filter((i) => i.status === "open");
}

// Live satisfaction: data/loop.json (board-adjustable slider) wins; else config.
function liveSatisfaction(lc) {
  const loop = readBoardJson(join("data", "loop.json"));
  if (loop && Number.isFinite(Number(loop.satisfaction))) return Number(loop.satisfaction);
  return lc.satisfaction;
}
function liveTestGate(lc) {
  const loop = readBoardJson(join("data", "loop.json"));
  if (loop && typeof loop.testGate === "boolean") return loop.testGate;
  return lc.testsRequired;
}

// ── the agent tick (manual `run` / inside `watch`) ──────────────────────────
function runAgentOnce(lc, cwd) {
  step("Invoking agent: " + paint(C.bold, lc.agentCmd));
  log(paint(C.dim, "  (cwd: " + cwd + ")"));
  // shell:true — agentCmd is a user-config command string (trusted), like a cron line.
  const r = spawnSync(lc.agentCmd, { cwd, stdio: "inherit", shell: true });
  if (r.error) { fail("Could not run the agent command: " + r.error.message); return false; }
  if (r.status !== 0) { warn("Agent command exited " + r.status); return false; }
  ok("Agent tick complete.");
  return true;
}

// ── the verifiable gate (`verify`, also called by the skill before posting) ──
// Finds an Istanbul-style coverage summary if present (coverage/coverage-summary.json).
function readCoveragePct(dir) {
  const candidates = [
    join(dir, "coverage", "coverage-summary.json"),
    join(dir, "coverage", "coverage-final-summary.json"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const j = JSON.parse(readFileSync(p, "utf8"));
      const t = j.total || {};
      const pct = (t.lines && t.lines.pct) ?? (t.statements && t.statements.pct);
      if (Number.isFinite(Number(pct))) return Number(pct);
    } catch { /* ignore unparseable summary */ }
  }
  return null;
}

function verify(lc, dir) {
  step("Verifiable goal — running: " + paint(C.bold, lc.testCommand));
  log(paint(C.dim, "  (cwd: " + dir + ")"));
  const r = spawnSync(lc.testCommand, { cwd: dir, stdio: "inherit", shell: true });
  if (r.error) { fail("Could not run the test command: " + r.error.message); return EXIT.GOAL_NOT_MET; }
  const testsPassed = r.status === 0;
  if (!testsPassed) { fail("Tests FAILED (exit " + r.status + ") — the verifiable goal is not met."); return EXIT.GOAL_NOT_MET; }
  ok("Tests passed.");

  if (lc.coverage > 0) {
    const pct = readCoveragePct(dir);
    if (pct === null) {
      warn("Coverage threshold is " + lc.coverage + "% but no coverage/coverage-summary.json was found.");
      log(paint(C.dim, "  Emit one (e.g. vitest --coverage / jest --coverage with json-summary), or set loop.goal.tests.coverage to 0."));
      log(paint(C.dim, "  Falling back to the test exit code (treating tests-pass as the gate)."));
    } else if (pct < lc.coverage) {
      fail("Coverage " + pct + "% < required " + lc.coverage + "% — the verifiable goal is not met.");
      return EXIT.GOAL_NOT_MET;
    } else {
      ok("Coverage " + pct + "% ≥ required " + lc.coverage + "%.");
    }
  }
  ok("Verifiable goal MET.");
  return EXIT.OK;
}

// ── schedule: print the OS-scheduler install line (no execution) ────────────
function printSchedule(lc) {
  const cron = flag("cron") || lc.cron;
  // Carry --agent into the installed line so the scheduled tick drives the same loop.
  const agentArg = flag("agent") ? ` --agent '${flag("agent")}'` : "";
  const runner = `node "${join(SCRIPT_DIR, "loop.mjs")}" run${agentArg}`;
  log(paint(C.bold, "Schedule trigger — install ONE of these (they run the loop on a cadence):\n"));
  log(paint(C.cyan, "cron (macOS / Linux):"));
  log("  Run `crontab -e` and add:");
  log("    " + cron + "  cd " + BOARD_DIR + " && " + runner + " >> loop.log 2>&1");
  log("");
  log(paint(C.cyan, "Windows Task Scheduler (PowerShell, daily 09:00):"));
  log('  $action  = New-ScheduledTaskAction -Execute "node" -Argument \'' + join(SCRIPT_DIR, "loop.mjs") + ' run\' -WorkingDirectory "' + BOARD_DIR + '"');
  log("  $trigger = New-ScheduledTaskTrigger -Daily -At 9am");
  log('  Register-ScheduledTask -TaskName "snapfix-loop" -Action $action -Trigger $trigger');
  log("");
  log(paint(C.cyan, "Claude Code routine (cloud schedule):"));
  log("  In Claude Code, run:  /schedule  and point it at  /fix-issues  on your cron of choice.");
  log("");
  log(paint(C.dim, "cron spec: " + cron + "   (edit with --cron \"<spec>\")"));
}

// ── watch: action trigger — poll for work, kick the agent, repeat ───────────
async function watch(lc, dir, branch) {
  const interval = Math.max(5, Number(flag("interval")) || lc.pollSeconds);
  const untilEmpty = has("until-empty");
  log(paint(C.bold, "Watch trigger") + " — polling every " + interval + "s for new open issues" + (untilEmpty ? " (stops when the queue is empty)" : "") + ".");
  log(paint(C.dim, "  Ctrl+C to stop. Agent: " + lc.agentCmd));
  let lastSeen = new Set();
  let firstPass = true;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    gitPullBoard(branch);
    const open = openIssues();
    const ids = new Set(open.map((i) => i.id));
    const fresh = open.filter((i) => !lastSeen.has(i.id));
    lastSeen = ids;

    if (open.length === 0) {
      if (untilEmpty && !firstPass) { ok("Queue empty — goal met, stopping watch."); return EXIT.OK; }
      log(paint(C.dim, new Date().toISOString() + "  no open issues"));
    } else if (fresh.length > 0 || firstPass) {
      step(new Date().toISOString() + "  " + open.length + " open issue(s)" + (fresh.length ? ", " + fresh.length + " new" : "") + " — kicking the agent.");
      runAgentOnce(lc, dir);
      if (untilEmpty) { firstPass = false; await sleep(interval * 1000); continue; }
    } else {
      log(paint(C.dim, new Date().toISOString() + "  " + open.length + " open, none new"));
    }
    firstPass = false;
    await sleep(interval * 1000);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── status ──────────────────────────────────────────────────────────────────
function status(lc, dir, branch) {
  gitPullBoard(branch);
  const sat = liveSatisfaction(lc);
  const gate = liveTestGate(lc);
  const open = openIssues();
  const review = open.filter((i) => i.needsReview).length;
  log(paint(C.bold, "snapfix loop status\n"));
  log("  Trigger        " + lc.trigger);
  log("  Agent command  " + lc.agentCmd);
  log("  Schedule cron  " + lc.cron);
  log("  Action on      " + lc.actionOn + " (poll " + lc.pollSeconds + "s)");
  log("");
  log(paint(C.bold, "  Goal"));
  log("    Verifiable   tests " + (gate ? "REQUIRED" : "optional") + " — `" + lc.testCommand + "`" + (lc.coverage > 0 ? " (coverage ≥ " + lc.coverage + "%)" : ""));
  log("    LLM-as-judge satisfaction ≥ " + sat + "/100 to post a fix");
  log("");
  log(paint(C.bold, "  Queue"));
  log("    Open issues  " + open.length + (review ? "  (" + review + " awaiting your review)" : ""));
  log("    Board repo   " + BOARD_DIR);
  log("    App repo     " + dir);
}

// ── usage ─────────────────────────────────────────────────────────────────
function usage(code) {
  log(paint(C.bold, "snapfix loop runner — trigger layer for the fix-issues loop\n"));
  log("  node tools/loop.mjs status                 loop config, open count, satisfaction");
  log("  node tools/loop.mjs run [--agent \"<cmd>\"]    one tick: invoke the agent once");
  log("  node tools/loop.mjs watch [--interval 60] [--until-empty] [--agent \"<cmd>\"]");
  log("  node tools/loop.mjs schedule [--cron \"0 9 * * *\"] [--agent \"<cmd>\"]");
  log("  node tools/loop.mjs verify                  run the verifiable gate (tests + coverage)");
  log("");
  log(paint(C.dim, "  --agent \"<cmd>\" overrides loop.schedule.agentCmd for this run (drive any catalog loop)."));
  log(paint(C.dim, "  A loop = trigger + goal. See LOOP.md."));
  process.exit(code);
}

// ── main ─────────────────────────────────────────────────────────────────
async function main() {
  const cfgGlobal = loadConfig();
  const lc = loopConfig(cfgGlobal.cfg);
  lc.agentCmd = agentCmdFor(lc, flag("agent")); // --agent overrides config for run/watch
  const dir = appDir(cfgGlobal.cfg, cfgGlobal.path);
  const branch = (cfgGlobal.cfg.board && cfgGlobal.cfg.board.branch) || "main";

  switch (cmd) {
    case "status": return void status(lc, dir, branch);
    case "run": return void process.exit(runAgentOnce(lc, dir) ? EXIT.OK : EXIT.GOAL_NOT_MET);
    case "verify": return void process.exit(verify(lc, dir));
    case "schedule": return void printSchedule(lc);
    case "watch": return void process.exit(await watch(lc, dir, branch));
    case undefined:
    case "help":
    case "--help":
    case "-h": return usage(EXIT.OK);
    default:
      fail("Unknown command: " + cmd);
      usage(EXIT.USAGE);
  }
}

// Run only when executed directly. Importing (tests set SNAPFIX_NO_MAIN=1) keeps
// the module inert so the pure helpers can be unit-tested without touching git,
// the filesystem walk, or process.exit. Matches bin/create.mjs's guard.
if (!process.env.SNAPFIX_NO_MAIN) {
  main();
}

export { loopConfig, agentCmdFor, appDir, readCoveragePct, loadConfig, verify, runAgentOnce, printSchedule, EXIT };
