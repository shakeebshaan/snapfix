// snapfix — Loop Library recommender. Pure, zero-dependency helpers that turn
// snapfix's catalog of loop markdown files (loops/*.md) into a small,
// project-relevant set of recommendations for the `init` CLI to print.
//
// Design constraints (mirror bin/create.mjs):
//   - ESM, Node builtins ONLY (we touch fs just for buildCatalog).
//   - No top-level side effects, no process.exit — importing is inert.
//   - Cross-platform: path.join everywhere, no shell-isms.
//
// Three exports, consumed by create.mjs:
//   buildCatalog(loopsDir)            → parse front-matter into catalog entries
//   selectLoops(signals, catalog,opt) → PURE: pick the relevant subset
//   recommendedLoopsMarkdown(sel,opt) → render RECOMMENDED-LOOPS.md text

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LOOP_LIBRARY_URL = "https://signals.forwardfuture.ai/loop-library/";

// ---------------------------------------------------------------------------
// Tag buckets. Each loop's slug+title+goal is lowercased and scanned for these
// keywords; a match adds the bucket name as a tag. A loop may earn several.
// (Lists are deliberately small + readable — this is taste, not science.)
// ---------------------------------------------------------------------------

const TAG_BUCKETS = {
  web: ["page", "css", "ui", "ux", "seo", "geo", "accessibility", "frontend", "onboarding", "pixel", "load"],
  tests: ["test", "coverage", "stabiliz", "quality"],
  perf: ["load", "speed", "cold", "trimmer", "bytes"],
  docs: ["doc", "changelog"],
  a11y: ["accessibility", "a11y"],
  design: ["css", "ui", "ux", "design", "pixel", "visual", "onboarding"],
  ops: ["release", "deploy", "production", "maintainer", "baseline", "error"],
  review: ["review", "adversarial", "judge", "convergence", "champion"],
  logging: ["logging", "error"],
};

// Derive the keyword-tag set for one loop from its slug + title + goal text.
function deriveTags(slug, title, goal) {
  const hay = `${slug} ${title || ""} ${goal || ""}`.toLowerCase();
  const tags = [];
  for (const [tag, keywords] of Object.entries(TAG_BUCKETS)) {
    if (keywords.some((kw) => hay.includes(kw))) tags.push(tag);
  }
  return tags;
}

// Turn a slug like "sub-50ms-page-load" into a Title-ish fallback title.
function titleFromSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Pull the first front-matter block (between the first pair of `---` lines) and
// parse simple `key: value` pairs. Best-effort + tolerant: a missing block or a
// missing key just yields undefined for that field. Values keep their `:`s
// (e.g. "verifiable — every page loads in under 50 ms") since we only split on
// the FIRST colon.
function parseFrontMatter(text) {
  const lines = text.split(/\r?\n/);
  // Find the opening `---` (allow leading blank lines / BOM).
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || lines[i].trim() !== "---") return {};
  i++;
  const out = {};
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") break; // end of block
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

// ---------------------------------------------------------------------------
// buildCatalog — read every loops/*.md (except README.md) into catalog entries.
// ---------------------------------------------------------------------------

/**
 * @param {string} loopsDir  absolute path to the loops/ directory
 * @returns {{slug,title,category,trigger,goal,tags}[]} sorted by category, slug
 */
export function buildCatalog(loopsDir) {
  const files = readdirSync(loopsDir)
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .filter((f) => f.toLowerCase() !== "readme.md");

  const catalog = files.map((file) => {
    const slug = file.replace(/\.md$/i, "");
    let fm = {};
    try {
      fm = parseFrontMatter(readFileSync(join(loopsDir, file), "utf8"));
    } catch {
      fm = {}; // unreadable file → degrade to a slug-only entry, don't throw
    }
    const title = fm.title || titleFromSlug(slug);
    return {
      slug,
      title,
      category: fm.category || "",
      trigger: fm.trigger || "",
      goal: fm.goal || "",
      tags: deriveTags(slug, title, fm.goal),
    };
  });

  // Deterministic order: category, then slug (both case-insensitive).
  catalog.sort((a, b) => {
    const c = a.category.toLowerCase().localeCompare(b.category.toLowerCase());
    return c !== 0 ? c : a.slug.localeCompare(b.slug);
  });
  return catalog;
}

// ---------------------------------------------------------------------------
// selectLoops — PURE. Map project signals → a recommended, de-duped subset.
// ---------------------------------------------------------------------------

const FLAGSHIP = "fix-issues-qa";

/**
 * @param {object} signals  { framework, isWeb, hasTests, hasCI, hasDesignTokens, hasDocs, hasTypeScript }
 * @param {Array}  catalog  output of buildCatalog
 * @param {object} opts     { max?: number }
 * @returns {{slug,title,why}[]} ordered, de-duped, capped recommendations
 */
export function selectLoops(signals = {}, catalog = [], opts = {}) {
  const max = opts.max ?? 8;
  const bySlug = new Map(catalog.map((e) => [e.slug, e]));
  const has = (slug) => bySlug.has(slug);

  // Ordered (slug, why) candidates. Rule order below IS the priority order;
  // de-dup keeps the first `why`. Only existing slugs survive (filtered later).
  const candidates = [];
  const add = (slug, why) => candidates.push({ slug, why });

  // 1. ALWAYS first: the flagship loop you just set up.
  add(FLAGSHIP, "snapfix's flagship — the screenshot-to-AI-fix loop you just set up");

  // 2. Web / UI projects: speed, a11y, design, discoverability, first-run.
  if (signals.isWeb) {
    add("sub-50ms-page-load", "your app is a web UI — keep every route loading fast");
    add("accessibility-repair", "web UI — drive it to a WCAG/standards bar");
    add("ui-ux-score", "web UI — score look-and-feel and iterate until it clears the bar");
    add("seo-geo-visibility", "web UI — stay visible to search and answer engines");
    add("easy-onboarding", "web UI — polish the first-run flow until a new user reaches value");
  }

  // 3. Has a test suite: lean on it.
  if (signals.hasTests) {
    add("test-coverage-100", "you already have a test suite — push it to full coverage");
    add("test-stabilizer", "stabilize the existing suite until it passes consistently");
    add("quality-streak", "run the quality gate until it passes N times in a row");
  }

  // 4. Has docs: keep them honest.
  if (signals.hasDocs) {
    add("overnight-docs-sweep", "you ship docs — comb them and rewrite stale ones overnight");
    add("nightly-changelog", "turn each day's merged work into a reviewed changelog");
  }

  // 5. Has CI: recurring janitor + live-error hygiene.
  if (signals.hasCI) {
    add("five-minute-repo-maintainer", "you have CI — run a quick recurring janitor pass on every tick");
    add("production-error-sweep", "you have CI/ops — pull live errors and fix until the stream goes quiet");
  }

  // 6. Has design tokens: design-quality loops.
  if (signals.hasDesignTokens) {
    add("ui-ux-score", "you have design tokens — keep visual + interaction marks above the bar");
    add("pixel-safe-css-trim", "trim dead CSS while every screen stays pixel-identical");
  }

  // 7. Always: broadly-useful hygiene for any project.
  add("architecture-satisfaction", "general hygiene — refactor structure until tests stay green and the shape feels right");
  add("logging-coverage", "general hygiene — instrument critical paths until they're observable and tested");

  // De-dup by slug (keep FIRST why), drop slugs absent from the catalog.
  const seen = new Set();
  const picked = [];
  for (const c of candidates) {
    if (seen.has(c.slug) || !has(c.slug)) continue;
    seen.add(c.slug);
    const entry = bySlug.get(c.slug);
    picked.push({ slug: c.slug, title: entry.title, why: c.why });
  }

  // Cap to max, but the flagship (if present) is never dropped: it's already
  // first, so a simple slice keeps it. If max < the count and the flagship
  // somehow isn't in the kept prefix, re-insert it.
  if (picked.length <= max) return picked;
  const capped = picked.slice(0, max);
  if (has(FLAGSHIP) && !capped.some((p) => p.slug === FLAGSHIP)) {
    capped.pop();
    capped.unshift(picked.find((p) => p.slug === FLAGSHIP));
  }
  return capped;
}

// ---------------------------------------------------------------------------
// recommendedLoopsMarkdown — render the RECOMMENDED-LOOPS.md text.
// ---------------------------------------------------------------------------

// Escape a `|` so it can't break the markdown table layout.
function cell(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/**
 * @param {{slug,title,why,goal?}[]} selected  output of selectLoops (goal optional)
 * @param {object} opts  { project?: string, catalog?: Array }
 * @returns {string} markdown for a RECOMMENDED-LOOPS.md file
 */
export function recommendedLoopsMarkdown(selected = [], opts = {}) {
  const project = opts.project || "your project";
  // If a catalog is provided we can enrich the table's Goal column.
  const goalFor = new Map((opts.catalog || []).map((e) => [e.slug, e.goal]));

  const lines = [];
  lines.push(`# Recommended loops`);
  lines.push("");
  lines.push(`Project-relevant loops for **${project}**, from snapfix's Loop Library.`);
  lines.push("");
  lines.push(`| Loop | Why | Goal |`);
  lines.push(`| --- | --- | --- |`);
  for (const s of selected) {
    const goal = s.goal || goalFor.get(s.slug) || "";
    lines.push(`| ${cell(s.title)} | ${cell(s.why)} | ${cell(goal)} |`);
  }
  lines.push("");
  lines.push(
    `Open any loop's recipe at \`loops/<slug>.md\` (e.g. \`loops/${
      selected[0] ? selected[0].slug : "fix-issues-qa"
    }.md\`).`
  );
  lines.push("");
  lines.push(`See the full Loop Library: ${LOOP_LIBRARY_URL}`);
  lines.push("");
  return lines.join("\n");
}
