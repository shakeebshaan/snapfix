// Unit tests for the pure, exported helpers in bin/create.mjs.
// SNAPFIX_NO_MAIN keeps the module inert (no init() / no network) on import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.SNAPFIX_NO_MAIN = "1";
const {
  detectFramework,
  gatherSignals,
  buildQaConfig,
  buildConfigJs,
  buildLoopJson,
  detectTestCommand,
  sanitizeRepoName,
  parseArgs,
} = await import("../bin/create.mjs");

function tmpRepo(pkg) {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-test-"));
  if (pkg !== undefined) writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  return dir;
}

test("detectFramework: vite from devDependencies", () => {
  const dir = tmpRepo({ devDependencies: { vite: "^5" } });
  try {
    assert.equal(detectFramework(dir).framework, "vite");
    assert.equal(detectFramework(dir).port, 5173);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("detectFramework: next beats vite (ordering)", () => {
  const dir = tmpRepo({ dependencies: { next: "14", vite: "5" } });
  try { assert.equal(detectFramework(dir).framework, "next"); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("detectFramework: angular / sveltekit / react-scripts / vue-cli", () => {
  const cases = [
    [{ dependencies: { "@angular/core": "17" } }, "angular", 4200],
    [{ dependencies: { "@sveltejs/kit": "2" } }, "sveltekit", 5173],
    [{ dependencies: { "react-scripts": "5" } }, "react-scripts", 3000],
    [{ devDependencies: { "@vue/cli-service": "5" } }, "vue-cli", 8080],
    [{ dependencies: { svelte: "4" } }, "svelte", 5173],
  ];
  for (const [pkg, fw, port] of cases) {
    const dir = tmpRepo(pkg);
    try {
      const d = detectFramework(dir);
      assert.equal(d.framework, fw, `expected ${fw}`);
      assert.equal(d.port, port);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("detectFramework: detects from scripts text when no dep", () => {
  const dir = tmpRepo({ scripts: { dev: "next dev" } });
  try { assert.equal(detectFramework(dir).framework, "next"); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("detectFramework: unknown when no package.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-test-"));
  try {
    assert.equal(detectFramework(dir).framework, "unknown");
    assert.equal(detectFramework(dir).port, 3000);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("detectFramework: unknown on unparseable package.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-test-"));
  writeFileSync(join(dir, "package.json"), "{ not json");
  try { assert.equal(detectFramework(dir).framework, "unknown"); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("detectTestCommand: npm test when a test script exists", () => {
  const dir = tmpRepo({ scripts: { test: "vitest run" } });
  try { assert.equal(detectTestCommand(dir), "npm test"); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("detectTestCommand: test:unit fallback", () => {
  const dir = tmpRepo({ scripts: { "test:unit": "jest" } });
  try { assert.equal(detectTestCommand(dir), "npm run test:unit"); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("detectTestCommand: defaults to npm test with no package.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-test-"));
  try { assert.equal(detectTestCommand(dir), "npm test"); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("buildQaConfig: shape + repo names + loop goal defaults", () => {
  const cfg = buildQaConfig({
    owner: "octo", board: "app-qa", priv: "app-qa-private", branch: "main",
    devServer: "http://localhost:5173", viewport: "390x844", framework: "vite",
    authStrategy: "none", tokenKey: "access_token", appRepoPath: ".",
  });
  assert.equal(cfg.board.owner, "octo");
  assert.equal(cfg.board.repo, "app-qa");
  assert.equal(cfg.board.private, "app-qa-private");
  assert.equal(cfg.app.repo, ".");
  assert.equal(cfg.reproduce.tool, "playwright");
  assert.equal(cfg.auth.strategy, "none");
  // The loop section is the new contract.
  assert.equal(cfg.loop.trigger, "manual");
  assert.equal(cfg.loop.goal.satisfaction, 80);
  assert.equal(cfg.loop.goal.tests.required, true);
  assert.equal(typeof cfg.loop.goal.tests.command, "string");
  assert.equal(cfg.loop.schedule.agentCmd.includes("fix-issues"), true);
});

test("buildConfigJs: emits window.QA_CONFIG with the right keys", () => {
  const js = buildConfigJs({ owner: "octo", board: "app-qa", priv: "app-qa-private", branch: "main", title: "App QA" });
  assert.match(js, /window\.QA_CONFIG = /);
  // Parse the JSON object literal that follows the assignment (the leading
  // comment block also contains braces, so anchor on the assignment).
  const after = js.slice(js.indexOf("window.QA_CONFIG = ") + "window.QA_CONFIG = ".length);
  const obj = JSON.parse(after.slice(after.indexOf("{"), after.lastIndexOf("}") + 1));
  assert.equal(obj.owner, "octo");
  assert.equal(obj.repo, "app-qa");
  assert.equal(obj.privateRepo, "app-qa-private");
  assert.equal(obj.title, "App QA");
});

test("buildLoopJson: defaults + honors resolved.satisfaction", () => {
  assert.equal(buildLoopJson({}).satisfaction, 80);
  assert.equal(buildLoopJson({}).testGate, true);
  assert.equal(buildLoopJson({ satisfaction: 95 }).satisfaction, 95);
  assert.equal(buildLoopJson({ satisfaction: 0 }).satisfaction, 0); // 0 must survive (?? not ||)
});

test("sanitizeRepoName: spaces→hyphens, strips junk, keeps . _ -", () => {
  assert.equal(sanitizeRepoName("My App"), "My-App");
  assert.equal(sanitizeRepoName("a/b!c"), "abc");
  assert.equal(sanitizeRepoName("ok_name-1.2"), "ok_name-1.2");
  assert.equal(sanitizeRepoName("  .-lead"), "lead");
});

test("parseArgs: flags, --key=value, positional, --yes", () => {
  const a = parseArgs(["init", "--name", "x-qa", "--owner=acme", "--yes", "--dev-server", "http://h:1"]);
  assert.deepEqual(a._, ["init"]);
  assert.equal(a.name, "x-qa");
  assert.equal(a.owner, "acme");
  assert.equal(a.yes, true);
  assert.equal(a.devServer, "http://h:1");
});

test("parseArgs: -h sets help", () => {
  assert.equal(parseArgs(["-h"]).help, true);
  assert.equal(parseArgs(["--help"]).help, true);
});

test("parseArgs: --auto implies --yes; -A and --auto= forms; tick/trigger/no-fix", () => {
  const a = parseArgs(["init", "--auto", "--tick", "30", "--trigger", "action", "--no-fix"]);
  assert.equal(a.auto, true);
  assert.equal(a.yes, true);          // --auto must be non-interactive
  assert.equal(a.tick, "30");
  assert.equal(a.trigger, "action");
  assert.equal(a.noFix, true);
  assert.equal(parseArgs(["-A"]).auto, true);
  assert.equal(parseArgs(["--auto=1"]).auto, true);
  assert.equal(parseArgs(["--tick=45"]).tick, "45");
});

test("gatherSignals: rich web project → all signals true", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-sig-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    writeFileSync(join(dir, "index.html"), "<!doctype html>");
    writeFileSync(join(dir, "README.md"), "# app");
    writeFileSync(join(dir, "tsconfig.json"), "{}");
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    const s = gatherSignals(dir, { framework: "vite", port: 5173 }, { source: "css" });
    assert.equal(s.isWeb, true);
    assert.equal(s.hasTests, true);
    assert.equal(s.hasCI, true);
    assert.equal(s.hasDocs, true);
    assert.equal(s.hasTypeScript, true);
    assert.equal(s.hasDesignTokens, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("gatherSignals: empty dir + unknown + no theme → all false", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-sig-"));
  try {
    const s = gatherSignals(dir, { framework: "unknown", port: 3000 }, null);
    assert.equal(s.isWeb, false);
    assert.equal(s.hasTests, false);
    assert.equal(s.hasCI, false);
    assert.equal(s.hasDocs, false);
    assert.equal(s.hasDesignTokens, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("gatherSignals: npm placeholder test script is NOT a real test suite", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-sig-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      scripts: { test: 'echo "Error: no test specified" && exit 1' },
    }));
    assert.equal(gatherSignals(dir, { framework: "unknown" }, null).hasTests, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("buildQaConfig: threads tuned trigger/tick/satisfaction + recommended + theme", () => {
  const cfg = buildQaConfig({
    owner: "octo", board: "app-qa", priv: "app-qa-private", branch: "main",
    devServer: "http://localhost:5173", viewport: "1280x800", framework: "vite",
    authStrategy: "none", tokenKey: "access_token", appRepoPath: ".",
    trigger: "action", pollSeconds: 120, satisfaction: 85,
    theme: { accent: "#3366ff", source: "css" },
    recommended: [{ slug: "sub-50ms-page-load", title: "Sub-50ms", why: "web app" }],
  });
  assert.equal(cfg.loop.trigger, "action");
  assert.equal(cfg.loop.action.pollSeconds, 120);
  assert.equal(cfg.loop.goal.satisfaction, 85);
  assert.equal(cfg.app.viewport, "1280x800");
  assert.equal(cfg.app.theme.accent, "#3366ff");
  assert.equal(cfg.loop.recommended.length, 1);
  assert.equal(cfg.loop.recommended[0].slug, "sub-50ms-page-load");
});

test("buildConfigJs: includes theme in window.QA_CONFIG", () => {
  const js = buildConfigJs({
    owner: "octo", board: "app-qa", priv: "app-qa-private", branch: "main",
    title: "App QA", theme: { accent: "#3366ff", bg: "#fff" },
  });
  const after = js.slice(js.indexOf("window.QA_CONFIG = ") + "window.QA_CONFIG = ".length);
  const obj = JSON.parse(after.slice(after.indexOf("{"), after.lastIndexOf("}") + 1));
  assert.equal(obj.theme.accent, "#3366ff");
  assert.equal(obj.theme.bg, "#fff");
});
