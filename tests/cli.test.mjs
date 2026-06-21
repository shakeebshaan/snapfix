// Integration tests: spawn each CLI and assert exit codes + key messages.
// These exercise the process.exit / argument-parsing / config-missing paths
// that can't be unit-imported. No network, no git mutation (every case bails
// before any GitHub/git call).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CREATE = join(ROOT, "bin", "create.mjs");
const QA = join(ROOT, "template", "tools", "qa.mjs");
const LOOP = join(ROOT, "template", "tools", "loop.mjs");
const RECAPTURE = join(ROOT, "template", "recapture.mjs");

const node = (args, opts = {}) =>
  spawnSync(process.execPath, args, { encoding: "utf8", cwd: opts.cwd, timeout: 30000 });

function emptyDir() { return mkdtempSync(join(tmpdir(), "snapfix-cli-")); }
function configDir(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-cli-"));
  const cfg = {
    board: { owner: "o", repo: "r", private: "p", branch: "main" },
    app: { repo: ".", devServer: "http://localhost:5173", viewport: "390x844", framework: "vite" },
    reproduce: { tool: "playwright", recaptureCmd: "node recapture.mjs {route} {out}" },
    auth: { strategy: "none", tokenKey: "access_token", loginUrl: "/" },
    ...extra,
  };
  writeFileSync(join(dir, "qa.config.json"), JSON.stringify(cfg));
  return dir;
}

test("create.mjs --help: exit 0, prints usage", () => {
  const r = node([CREATE, "--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /snapfix/);
  assert.match(r.stdout, /Usage:/);
});

test("create.mjs unknown command: non-zero exit", () => {
  const r = node([CREATE, "bogus"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /Unknown command/);
});

test("qa.mjs without a config: exit 1 with a clear error", () => {
  const dir = emptyDir();
  try {
    const r = node([QA, "list"], { cwd: dir });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /qa\.config\.json not found/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("qa.mjs with a config, no command: prints the command list", () => {
  const dir = configDir();
  try {
    const r = node([QA], { cwd: dir });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Commands:/);
    // The new loop gate flags are advertised.
    assert.match(r.stdout, /--judge/);
    assert.match(r.stdout, /--tests/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("loop.mjs without a config: exit 3 (CONFIG)", () => {
  const dir = emptyDir();
  try {
    const r = node([LOOP, "status"], { cwd: dir });
    assert.equal(r.status, 3);
    assert.match(r.stderr, /qa\.config\.json not found/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("loop.mjs schedule: prints scheduler lines (no execution)", () => {
  const dir = configDir({ loop: { schedule: { cron: "30 2 * * *" } } });
  try {
    const r = node([LOOP, "schedule"], { cwd: dir });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /cron/);
    assert.match(r.stdout, /30 2 \* \* \*/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("loop.mjs help: prints usage (with a config present)", () => {
  const dir = configDir();
  try {
    const r = node([LOOP, "help"], { cwd: dir });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /loop = trigger \+ goal|trigger layer/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("recapture.mjs with no args: exit 3 (usage)", () => {
  const r = node([RECAPTURE]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /Usage/);
});

test("recapture.mjs with args but no config: exit 3", () => {
  const dir = emptyDir();
  try {
    const r = node([RECAPTURE, "/x", join(dir, "out.png")], { cwd: dir });
    assert.equal(r.status, 3);
    assert.match(r.stderr, /qa\.config\.json/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
