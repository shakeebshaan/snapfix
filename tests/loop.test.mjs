// Unit tests for the pure, exported helpers in template/tools/loop.mjs.
// SNAPFIX_NO_MAIN keeps the CLI dispatch inert on import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";

process.env.SNAPFIX_NO_MAIN = "1";
const { loopConfig, agentCmdFor, appDir, readCoveragePct, loadConfig, verify, runAgentOnce, printSchedule, EXIT } =
  await import("../template/tools/loop.mjs");

// A trivial, cross-platform command that exits with a chosen code, no output.
const exitCmd = (code) => `${JSON.stringify(process.execPath)} -e "process.exit(${code})"`;

test("loopConfig: safe defaults on an empty config", () => {
  const lc = loopConfig({});
  assert.equal(lc.trigger, "manual");
  assert.equal(lc.satisfaction, 80);
  assert.equal(lc.testsRequired, true);
  assert.equal(lc.testCommand, "npm test");
  assert.equal(lc.coverage, 0);
  assert.equal(lc.pollSeconds, 60);
  assert.match(lc.agentCmd, /fix-issues/);
});

test("loopConfig: reads provided values", () => {
  const lc = loopConfig({
    loop: {
      trigger: "schedule",
      schedule: { cron: "0 0 * * *", agentCmd: "codex run" },
      action: { on: "pr-open", pollSeconds: 15 },
      goal: { satisfaction: 95, tests: { required: false, command: "vitest", coverage: 90 } },
    },
  });
  assert.equal(lc.trigger, "schedule");
  assert.equal(lc.cron, "0 0 * * *");
  assert.equal(lc.agentCmd, "codex run");
  assert.equal(lc.actionOn, "pr-open");
  assert.equal(lc.pollSeconds, 15);
  assert.equal(lc.satisfaction, 95);
  assert.equal(lc.testsRequired, false);
  assert.equal(lc.testCommand, "vitest");
  assert.equal(lc.coverage, 90);
});

test("loopConfig: satisfaction 0 is preserved (judge gate off)", () => {
  assert.equal(loopConfig({ loop: { goal: { satisfaction: 0 } } }).satisfaction, 0);
});

test("agentCmdFor: --agent overrides config; absent/blank falls back", () => {
  const lc = { agentCmd: 'claude -p "/fix-issues"' };
  // Override wins so any catalog loop can ride the runner without editing config.
  assert.equal(agentCmdFor(lc, 'claude -p "/logging-coverage"'), 'claude -p "/logging-coverage"');
  // No override (undefined) or a blank one falls back to the configured command.
  assert.equal(agentCmdFor(lc, undefined), 'claude -p "/fix-issues"');
  assert.equal(agentCmdFor(lc, "   "), 'claude -p "/fix-issues"');
});

test("appDir: resolves app.repo against the config file location", () => {
  const configPath = "/proj/app/qa.config.json";
  assert.equal(appDir({ app: { repo: "." } }, configPath), resolve("/proj/app"));
  assert.equal(appDir({ app: { repo: "../other" } }, configPath), resolve("/proj/other"));
  assert.equal(appDir({}, configPath), resolve("/proj/app")); // default "."
});

test("readCoveragePct: reads total.lines.pct from coverage-summary.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-cov-"));
  mkdirSync(join(dir, "coverage"), { recursive: true });
  writeFileSync(join(dir, "coverage", "coverage-summary.json"),
    JSON.stringify({ total: { lines: { pct: 87.5 }, statements: { pct: 80 } } }));
  try { assert.equal(readCoveragePct(dir), 87.5); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("readCoveragePct: falls back to statements.pct when lines absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-cov-"));
  mkdirSync(join(dir, "coverage"), { recursive: true });
  writeFileSync(join(dir, "coverage", "coverage-summary.json"),
    JSON.stringify({ total: { statements: { pct: 72 } } }));
  try { assert.equal(readCoveragePct(dir), 72); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("readCoveragePct: null when no summary file present", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-cov-"));
  try { assert.equal(readCoveragePct(dir), null); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("readCoveragePct: null on unparseable summary", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-cov-"));
  mkdirSync(join(dir, "coverage"), { recursive: true });
  writeFileSync(join(dir, "coverage", "coverage-summary.json"), "{bad");
  try { assert.equal(readCoveragePct(dir), null); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("verify: tests pass + no coverage requirement → OK", () => {
  assert.equal(verify({ testCommand: exitCmd(0), coverage: 0 }, process.cwd()), EXIT.OK);
});

test("verify: tests fail → GOAL_NOT_MET", () => {
  assert.equal(verify({ testCommand: exitCmd(1), coverage: 0 }, process.cwd()), EXIT.GOAL_NOT_MET);
});

test("verify: coverage threshold met / not met / unmeasurable", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-verify-"));
  mkdirSync(join(dir, "coverage"), { recursive: true });
  writeFileSync(join(dir, "coverage", "coverage-summary.json"), JSON.stringify({ total: { lines: { pct: 95 } } }));
  try {
    assert.equal(verify({ testCommand: exitCmd(0), coverage: 90 }, dir), EXIT.OK);          // 95 ≥ 90
    assert.equal(verify({ testCommand: exitCmd(0), coverage: 99 }, dir), EXIT.GOAL_NOT_MET); // 95 < 99
  } finally { rmSync(dir, { recursive: true, force: true }); }
  // Coverage required but no summary present → warn + fall back to test exit code.
  const bare = mkdtempSync(join(tmpdir(), "snapfix-verify-"));
  try { assert.equal(verify({ testCommand: exitCmd(0), coverage: 80 }, bare), EXIT.OK); }
  finally { rmSync(bare, { recursive: true, force: true }); }
});

test("runAgentOnce: exit 0 → true, exit 1 → false, bad command → false", () => {
  assert.equal(runAgentOnce({ agentCmd: exitCmd(0) }, process.cwd()), true);
  assert.equal(runAgentOnce({ agentCmd: exitCmd(3) }, process.cwd()), false);
  // A command that the shell reports as failing also returns false (no throw).
  assert.equal(runAgentOnce({ agentCmd: "snapfix__definitely_not_a_real_binary__" }, process.cwd()), false);
});

test("printSchedule: prints without throwing", () => {
  assert.doesNotThrow(() => printSchedule({ cron: "0 9 * * *" }));
});

test("loadConfig: finds + parses qa.config.json walking up from cwd", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-cfg-"));
  const sub = join(dir, "a", "b");
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(dir, "qa.config.json"),
    JSON.stringify({ board: { owner: "o", repo: "r", private: "p", branch: "main" }, app: { repo: "." } }));
  const prev = process.cwd();
  try {
    process.chdir(sub);
    const { cfg, path } = loadConfig();
    assert.equal(cfg.board.owner, "o");
    assert.match(path, /qa\.config\.json$/);
  } finally {
    process.chdir(prev);
    rmSync(dir, { recursive: true, force: true });
  }
});
