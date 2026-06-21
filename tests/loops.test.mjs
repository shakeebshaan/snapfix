// Unit tests for bin/lib/loops.mjs — the Loop Library recommender.
// Contracts under test:
//   buildCatalog               — parses the REAL loops/ dir into a sane catalog
//   selectLoops                — PURE signal → recommendation mapping
//   recommendedLoopsMarkdown   — renders a usable RECOMMENDED-LOOPS.md
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildCatalog,
  selectLoops,
  recommendedLoopsMarkdown,
} from "../bin/lib/loops.mjs";

// Resolve the repo's real loops/ dir relative to THIS test file (tests/ -> ../loops).
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOOPS_DIR = join(__dirname, "..", "loops");

// Build the real catalog once; several tests share it.
const realCatalog = buildCatalog(LOOPS_DIR);

// ---------------------------------------------------------------------------
// buildCatalog — against the real loops/ directory.
// ---------------------------------------------------------------------------

test("buildCatalog: non-empty, every entry has a slug+tags array", () => {
  // Contract: parsing the real catalog yields usable entries for the CLI.
  assert.ok(Array.isArray(realCatalog), "returns an array");
  assert.ok(realCatalog.length > 10, "real catalog has many loops");
  for (const e of realCatalog) {
    assert.equal(typeof e.slug, "string");
    assert.ok(e.slug.length > 0, "slug is non-empty");
    assert.equal(typeof e.title, "string");
    assert.ok(e.title.length > 0, "title falls back from slug when missing");
    assert.ok(Array.isArray(e.tags), "tags is always an array");
  }
});

test("buildCatalog: flagship present, README excluded", () => {
  // Contract: the flagship loop is in the catalog; the index README never is.
  const slugs = realCatalog.map((e) => e.slug);
  assert.ok(slugs.includes("fix-issues-qa"), "flagship fix-issues-qa is present");
  assert.ok(!slugs.some((s) => /readme/i.test(s)), "README.md is excluded");
});

test("buildCatalog: parses front-matter fields (title/category/goal)", () => {
  // Contract: known loops carry their real front-matter, not just a slug.
  const flagship = realCatalog.find((e) => e.slug === "fix-issues-qa");
  assert.equal(flagship.title, "Fix-issues QA loop");
  assert.equal(flagship.category, "Engineering");
  assert.ok(flagship.goal.length > 0, "goal parsed from front-matter");
});

test("buildCatalog: deterministic order (category, then slug)", () => {
  // Contract: stable output so the CLI prints the same thing every run.
  const again = buildCatalog(LOOPS_DIR);
  assert.deepEqual(again, realCatalog, "two builds are identical");
  for (let i = 1; i < realCatalog.length; i++) {
    const prev = realCatalog[i - 1];
    const cur = realCatalog[i];
    const c = prev.category.toLowerCase().localeCompare(cur.category.toLowerCase());
    if (c === 0) {
      assert.ok(prev.slug.localeCompare(cur.slug) <= 0, "slug-sorted within a category");
    } else {
      assert.ok(c < 0, "category-sorted overall");
    }
  }
});

test("buildCatalog: derives sensible tags for known loops", () => {
  // Contract: keyword buckets fire on the obvious loops.
  const a11y = realCatalog.find((e) => e.slug === "accessibility-repair");
  assert.ok(a11y.tags.includes("a11y"), "accessibility-repair → a11y");
  assert.ok(a11y.tags.includes("web"), "accessibility-repair → web");

  const speed = realCatalog.find((e) => e.slug === "sub-50ms-page-load");
  assert.ok(speed.tags.includes("perf") || speed.tags.includes("web"), "page-load → perf/web");

  const cov = realCatalog.find((e) => e.slug === "test-coverage-100");
  assert.ok(cov.tags.includes("tests"), "test-coverage-100 → tests");
});

// ---------------------------------------------------------------------------
// selectLoops — pure mapping. Use the real catalog for the rich cases and a
// synthetic small catalog for the "never invents a slug" contract.
// ---------------------------------------------------------------------------

test("selectLoops: web + tests includes a web loop, a tests loop, flagship FIRST", () => {
  const sel = selectLoops({ isWeb: true, hasTests: true }, realCatalog);
  assert.equal(sel[0].slug, "fix-issues-qa", "flagship is always first");

  const slugs = sel.map((s) => s.slug);
  const webLoops = ["sub-50ms-page-load", "accessibility-repair", "ui-ux-score", "seo-geo-visibility", "easy-onboarding"];
  const testLoops = ["test-coverage-100", "test-stabilizer", "quality-streak"];
  assert.ok(webLoops.some((w) => slugs.includes(w)), "includes at least one web loop");
  assert.ok(testLoops.some((t) => slugs.includes(t)), "includes at least one tests loop");

  // Every recommendation carries a non-empty why.
  for (const s of sel) assert.ok(s.why && s.why.length > 0, "each rec has a why");
});

test("selectLoops: all-false signals still returns flagship + always-includes", () => {
  const sel = selectLoops({}, realCatalog);
  const slugs = sel.map((s) => s.slug);
  assert.equal(sel[0].slug, "fix-issues-qa", "flagship first even with no signals");
  assert.ok(slugs.includes("architecture-satisfaction"), "always-include: architecture");
  assert.ok(slugs.includes("logging-coverage"), "always-include: logging");
});

test("selectLoops: respects opts.max but never drops the flagship", () => {
  const sel = selectLoops({ isWeb: true, hasTests: true, hasDocs: true, hasCI: true }, realCatalog, { max: 3 });
  assert.ok(sel.length <= 3, "capped to max");
  assert.equal(sel[0].slug, "fix-issues-qa", "flagship survives the cap");
});

test("selectLoops: never includes a slug absent from the catalog", () => {
  // Synthetic small catalog: only the flagship + one extra exist. Even with web
  // signals on, the web loops (not present here) must NOT appear.
  const small = [
    { slug: "fix-issues-qa", title: "Fix-issues QA loop", category: "Engineering", tags: [] },
    { slug: "logging-coverage", title: "Logging coverage loop", category: "Engineering", tags: [] },
  ];
  const sel = selectLoops({ isWeb: true, hasTests: true, hasDocs: true }, small);
  const slugs = sel.map((s) => s.slug);
  assert.deepEqual(slugs.sort(), ["fix-issues-qa", "logging-coverage"], "only catalog slugs survive");
  for (const s of slugs) assert.ok(small.some((e) => e.slug === s), `${s} exists in catalog`);
});

test("selectLoops: de-dups by slug, keeping the first why", () => {
  // ui-ux-score is added by BOTH the isWeb and hasDesignTokens rules; the web
  // why comes first and must win, and the slug must appear only once.
  const sel = selectLoops({ isWeb: true, hasDesignTokens: true }, realCatalog);
  const uiux = sel.filter((s) => s.slug === "ui-ux-score");
  assert.equal(uiux.length, 1, "ui-ux-score appears exactly once");
  assert.match(uiux[0].why, /web UI/, "kept the first (web) why, not the design-token one");
});

// ---------------------------------------------------------------------------
// recommendedLoopsMarkdown — rendered output.
// ---------------------------------------------------------------------------

test("recommendedLoopsMarkdown: has project name, table header, Loop Library URL", () => {
  const sel = selectLoops({ isWeb: true }, realCatalog);
  const md = recommendedLoopsMarkdown(sel, { project: "acme-app", catalog: realCatalog });
  assert.match(md, /acme-app/, "names the project");
  assert.match(md, /\| Loop \| Why \| Goal \|/, "has the table header");
  assert.match(md, /https:\/\/signals\.forwardfuture\.ai\/loop-library\//, "points to the Loop Library URL");
  assert.match(md, /loops\/fix-issues-qa\.md/, "points to a loops/<slug>.md path");
  // The flagship's title shows up as a table row.
  assert.match(md, /Fix-issues QA loop/, "renders a selected loop's title");
});

test("recommendedLoopsMarkdown: falls back to a generic project name", () => {
  const md = recommendedLoopsMarkdown(selectLoops({}, realCatalog));
  assert.match(md, /your project/, "uses a sensible default project name");
});
