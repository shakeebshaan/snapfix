// Unit tests for the pure helpers in bin/lib/demo-issue.mjs.
// Each test names the contract it protects (R6). No I/O, no clock — the module
// is fully deterministic, so we pass a fixed nowIso.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_ID, buildDemoIssue, isDemoIssue, seedDemoIssue } from "../bin/lib/demo-issue.mjs";

const NOW = "2026-06-21T12:34:56.000Z";

// A plausible non-demo issue, matching the board's submit-flow schema.
const realIssue = (id, description = "Button is misaligned on /pricing") => ({
  id, createdAt: NOW, route: "/pricing", description,
  author: "alice", imagePath: "x.png", imageCommit: "abc",
  imagePaths: ["x.png"], imageCommits: ["abc"], imagePrivate: true,
  status: "open", fix: null, history: [],
});

// ── buildDemoIssue ────────────────────────────────────────────────────────
test("buildDemoIssue: produces a board-schema demo issue (open, no image, no fix)", () => {
  const it = buildDemoIssue({ owner: "octocat", route: "/", nowIso: NOW });
  assert.equal(it.id, DEMO_ID);
  assert.equal(it.status, "open");
  assert.deepEqual(it.imagePaths, []);          // [] ⇒ board renders no image tile
  assert.deepEqual(it.imageCommits, []);
  assert.equal(it.fix, null);
  assert.deepEqual(it.history, []);
  assert.equal(it.demo, true);
  assert.equal(it.imagePrivate, false);
});

test("buildDemoIssue: honors passed nowIso and route", () => {
  const it = buildDemoIssue({ nowIso: NOW, route: "/dashboard" });
  assert.equal(it.createdAt, NOW);
  assert.equal(it.route, "/dashboard");
});

test("buildDemoIssue: defaults route to '/' and createdAt to a deterministic epoch", () => {
  const it = buildDemoIssue({});
  assert.equal(it.route, "/");
  assert.equal(it.createdAt, "1970-01-01T00:00:00.000Z");
  assert.equal(it.author, undefined);           // owner omitted ⇒ undefined author
});

test("buildDemoIssue: description is marked [snapfix demo]", () => {
  const it = buildDemoIssue({ nowIso: NOW });
  assert.ok(it.description.includes("[snapfix demo]"));
  assert.ok(it.description.startsWith("[snapfix demo]"));
});

test("buildDemoIssue: is deterministic for identical inputs", () => {
  const a = buildDemoIssue({ owner: "o", route: "/r", nowIso: NOW });
  const b = buildDemoIssue({ owner: "o", route: "/r", nowIso: NOW });
  assert.deepEqual(a, b);
});

// ── isDemoIssue ───────────────────────────────────────────────────────────
test("isDemoIssue: true for a built demo issue", () => {
  assert.equal(isDemoIssue(buildDemoIssue({ nowIso: NOW })), true);
});

test("isDemoIssue: true on id match alone", () => {
  assert.equal(isDemoIssue({ id: DEMO_ID }), true);
});

test("isDemoIssue: true on demo flag alone, and on description prefix alone", () => {
  assert.equal(isDemoIssue({ id: "other", demo: true }), true);
  assert.equal(isDemoIssue({ id: "other", description: "[snapfix demo] seeded" }), true);
});

test("isDemoIssue: false for a normal issue (and for non-objects)", () => {
  assert.equal(isDemoIssue(realIssue("i-real")), false);
  assert.equal(isDemoIssue(null), false);
  assert.equal(isDemoIssue(undefined), false);
});

// ── seedDemoIssue ─────────────────────────────────────────────────────────
test("seedDemoIssue: into an empty board yields one issue, demo first", () => {
  const demo = buildDemoIssue({ nowIso: NOW });
  const out = seedDemoIssue({ version: 1, issues: [] }, demo);
  assert.equal(out.version, 1);
  assert.equal(out.issues.length, 1);
  assert.equal(out.issues[0].id, DEMO_ID);
});

test("seedDemoIssue: prepends demo while preserving existing real issues", () => {
  const demo = buildDemoIssue({ nowIso: NOW });
  const db = { version: 1, issues: [realIssue("i-1"), realIssue("i-2")] };
  const out = seedDemoIssue(db, demo);
  assert.equal(out.issues.length, 3);
  assert.equal(out.issues[0].id, DEMO_ID);          // demo first
  assert.equal(out.issues[1].id, "i-1");            // reals preserved, in order
  assert.equal(out.issues[2].id, "i-2");
});

test("seedDemoIssue: is idempotent — running twice keeps exactly one demo (replaced, not duplicated)", () => {
  const demo = buildDemoIssue({ nowIso: NOW });
  const db = { version: 1, issues: [realIssue("i-1")] };
  const once = seedDemoIssue(db, demo);
  const twice = seedDemoIssue(once, buildDemoIssue({ nowIso: NOW }));
  assert.equal(twice.issues.length, 2);             // 1 demo + 1 real
  assert.equal(twice.issues.filter(isDemoIssue).length, 1);
  assert.equal(twice.issues[0].id, DEMO_ID);
  assert.equal(twice.issues[1].id, "i-1");
});

test("seedDemoIssue: null/missing db starts fresh at {version:1}", () => {
  const out = seedDemoIssue(null, buildDemoIssue({ nowIso: NOW }));
  assert.equal(out.version, 1);
  assert.equal(out.issues.length, 1);
  assert.equal(out.issues[0].id, DEMO_ID);
});

test("seedDemoIssue: does NOT mutate the input db", () => {
  const db = { version: 1, issues: [realIssue("i-1"), realIssue("i-2")] };
  const before = db.issues.length;
  const out = seedDemoIssue(db, buildDemoIssue({ nowIso: NOW }));
  assert.equal(db.issues.length, before);           // original untouched
  assert.notEqual(out, db);                          // new object returned
  assert.notEqual(out.issues, db.issues);            // new array returned
});
