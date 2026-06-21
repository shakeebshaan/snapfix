// Unit tests for the pure loop auto-tuner helpers in bin/lib/tune.mjs.
// Each test names the contract it guards (R6): given signals/args, expect the
// exact tuned value create.mjs will write into qa.config.json's loop section.
import { test } from "node:test";
import assert from "node:assert/strict";

const { resolveTick, resolveTrigger, resolveViewport, tuneSatisfaction, autoTune } =
  await import("../bin/lib/tune.mjs");

// --- resolveTick: explicit override beats signals; clamps to [5, 86400] ---

test("resolveTick: explicit numeric string is honored", () => {
  // Contract: a valid numeric string override is used verbatim (within bounds).
  assert.equal(resolveTick("30", { isWeb: true }), 30);
});

test("resolveTick: explicit value above ceiling clamps to 86400", () => {
  assert.equal(resolveTick(100000, {}), 86400);
});

test("resolveTick: explicit value below floor clamps to 5", () => {
  assert.equal(resolveTick(2, {}), 5);
});

test("resolveTick: no arg + isWeb → 60", () => {
  // Contract: a served web app polls often by default.
  assert.equal(resolveTick(undefined, { isWeb: true }), 60);
});

test("resolveTick: no arg + non-web → 300", () => {
  // Contract: a library/CLI rarely changes from a user's POV — poll rarely.
  assert.equal(resolveTick(undefined, { isWeb: false }), 300);
});

// --- resolveTrigger: explicit > auto-derived > manual ---

test("resolveTrigger: explicit 'schedule' is honored", () => {
  assert.equal(resolveTrigger({ trigger: "schedule" }, { isWeb: true }), "schedule");
});

test("resolveTrigger: auto + isWeb → 'action'", () => {
  // Contract: autonomous setup on a served app watches for new issues.
  assert.equal(resolveTrigger({ auto: true }, { isWeb: true }), "action");
});

test("resolveTrigger: auto + non-web → 'schedule'", () => {
  assert.equal(resolveTrigger({ auto: true }, { isWeb: false }), "schedule");
});

test("resolveTrigger: no auto → 'manual'", () => {
  // Contract: without --auto we stay out of the way.
  assert.equal(resolveTrigger({}, { isWeb: true }), "manual");
});

// --- resolveViewport: desktop signal flips the default ---

test("resolveViewport: defaults to 390x844 (mobile-first)", () => {
  assert.equal(resolveViewport({}), "390x844");
  assert.equal(resolveViewport({ isWeb: true }), "390x844");
});

test("resolveViewport: desktop signal → 1280x800", () => {
  assert.equal(resolveViewport({ desktop: true }), "1280x800");
});

test("resolveViewport: electron framework → 1280x800", () => {
  assert.equal(resolveViewport({ framework: "electron" }), "1280x800");
});

// --- tuneSatisfaction: judge bar rises when it's the only gate ---

test("tuneSatisfaction: hasTests → 80", () => {
  // Contract: a verifiable test floor exists, so the default judge bar is enough.
  assert.equal(tuneSatisfaction({ hasTests: true }), 80);
});

test("tuneSatisfaction: no tests → 85", () => {
  // Contract: the judge is the SOLE gate, so raise the bar.
  assert.equal(tuneSatisfaction({ hasTests: false }), 85);
  assert.equal(tuneSatisfaction({}), 85);
});

test("tuneSatisfaction: result is always in [0,100]", () => {
  for (const s of [{ hasTests: true }, { hasTests: false }, {}]) {
    const v = tuneSatisfaction(s);
    assert.equal(Number.isInteger(v), true);
    assert.ok(v >= 0 && v <= 100, `expected 0–100, got ${v}`);
  }
});

// --- autoTune: pure clone with the four fields overwritten + tuned:true ---

test("autoTune: overwrites the four fields, preserves others, no mutation", () => {
  const base = {
    pollSeconds: 60,
    trigger: "manual",
    viewport: "390x844",
    satisfaction: 80,
    framework: "vite",     // unrelated field that must survive untouched
    owner: "octo",
  };
  const baseSnapshot = JSON.parse(JSON.stringify(base));

  // No tests (→85), desktop (→1280x800), auto+non-web (→schedule),
  // explicit tick "30" (→30).
  const signals = { isWeb: false, hasTests: false, desktop: true };
  const args = { auto: true, tick: "30" };

  const out = autoTune(base, signals, args);

  // The four tuned fields.
  assert.equal(out.pollSeconds, 30);
  assert.equal(out.trigger, "schedule");
  assert.equal(out.viewport, "1280x800");
  assert.equal(out.satisfaction, 85);
  // The marker.
  assert.equal(out.tuned, true);
  // Unrelated fields preserved.
  assert.equal(out.framework, "vite");
  assert.equal(out.owner, "octo");

  // Contract: base is never mutated (deep-equal to its pre-call snapshot) and a
  // NEW object is returned.
  assert.deepEqual(base, baseSnapshot);
  assert.notEqual(out, base);
  assert.equal("tuned" in base, false);
});

test("autoTune: web + tests path tunes to action/60/390x844/80", () => {
  const base = { pollSeconds: 999, trigger: "manual", viewport: "x", satisfaction: 1 };
  const out = autoTune(base, { isWeb: true, hasTests: true }, { auto: true });
  assert.equal(out.pollSeconds, 60);     // web default tick
  assert.equal(out.trigger, "action");   // auto + web
  assert.equal(out.viewport, "390x844"); // mobile-first default
  assert.equal(out.satisfaction, 80);    // has tests
  assert.equal(out.tuned, true);
});
