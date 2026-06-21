// Unit tests for bin/lib/theme.mjs — the design-token extractor.
// Pure module: no env shim needed (no top-level side effects to suppress).
// Fixtures are built in OS temp dirs with mkdtempSync and torn down in finally.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { normalizeColor, isLightColor, extractTheme } from "../bin/lib/theme.mjs";

// Build a temp app fixture from a { relPath: contents } map. Nested dirs are
// created as needed so we can drop files under src/, node_modules/, etc.
function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "snapfix-theme-"));
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(dir, ...rel.split("/"));
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents);
  }
  return dir;
}

// ---------------------------------------------------------------------------
// normalizeColor — contract: recognized colors normalize to a canonical string;
// unrecognized input returns null.
// ---------------------------------------------------------------------------

test("normalizeColor: #abc expands to #aabbcc", () => {
  assert.equal(normalizeColor("#abc"), "#aabbcc");
  assert.equal(normalizeColor("#ABC"), "#aabbcc"); // case-insensitive
});

test("normalizeColor: 6- and 8-digit hex preserved (lowercased)", () => {
  assert.equal(normalizeColor("#6D28D9"), "#6d28d9");
  assert.equal(normalizeColor("#11223344"), "#11223344"); // alpha kept
});

test("normalizeColor: rgb()/hsl() pass through intact", () => {
  // The functional notation is preserved verbatim (commas kept); only runs of
  // internal whitespace are collapsed so the emitted token is tidy.
  assert.equal(normalizeColor("rgb(255, 0, 0)"), "rgb(255, 0, 0)");
  assert.equal(normalizeColor("hsl(210, 50%, 40%)"), "hsl(210, 50%, 40%)");
  assert.equal(normalizeColor("rgba(0,0,0,0.5)"), "rgba(0,0,0,0.5)");
  assert.equal(normalizeColor("rgb(  255 ,0 , 0 )"), "rgb(255 ,0 , 0)"); // ws collapsed
});

test("normalizeColor: unrecognized input returns null", () => {
  assert.equal(normalizeColor("not-a-color"), null);
  assert.equal(normalizeColor(""), null);
  assert.equal(normalizeColor(null), null);
  assert.equal(normalizeColor("#12"), null); // wrong hex length
});

test("normalizeColor: a named color resolves to hex", () => {
  assert.equal(normalizeColor("white"), "#ffffff");
  assert.equal(normalizeColor("BLACK"), "#000000");
  assert.equal(normalizeColor("teal"), "#008080");
});

// ---------------------------------------------------------------------------
// isLightColor — contract: perceptual lightness on parsed RGB / hsl lightness;
// light returns true, dark returns false; unparseable defaults to true.
// ---------------------------------------------------------------------------

test("isLightColor: white is light, black is dark", () => {
  assert.equal(isLightColor("#ffffff"), true);
  assert.equal(isLightColor("white"), true);
  assert.equal(isLightColor("#000000"), false);
  assert.equal(isLightColor("black"), false);
});

test("isLightColor: hsl uses lightness component", () => {
  assert.equal(isLightColor("hsl(0, 0%, 90%)"), true);
  assert.equal(isLightColor("hsl(0, 0%, 10%)"), false);
});

test("isLightColor: unparseable defaults to true", () => {
  assert.equal(isLightColor("not-a-color"), true);
  assert.equal(isLightColor(null), true);
});

// ---------------------------------------------------------------------------
// extractTheme — contract: scans a bounded set of likely files, maps tokens to
// fields, and reports their provenance in `source`.
// ---------------------------------------------------------------------------

test("extractTheme (a): CSS custom properties populate fields + source mentions css", () => {
  const dir = fixture({
    "src/index.css": `
      :root {
        --primary: #6d28d9;
        --background: #ffffff;
        --foreground: #111827;
        --card: #f9fafb;
        --radius: 0.5rem;
      }
    `,
  });
  try {
    const t = extractTheme(dir);
    assert.equal(t.accent, "#6d28d9");
    assert.equal(t.bg, "#ffffff");
    assert.equal(t.ink, "#111827");
    assert.equal(t.card, "#f9fafb");
    assert.equal(t.radius, "0.5rem"); // length kept as-is, not color-normalized
    assert.match(t.source, /css/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("extractTheme (b): tailwind.config.js primary color populates accent", () => {
  const dir = fixture({
    "tailwind.config.js": `
      module.exports = {
        theme: {
          extend: {
            colors: {
              primary: '#0ea5e9',
              brand: '#f43f5e',
            },
            borderRadius: { DEFAULT: '12px' },
            fontFamily: { sans: ['Poppins', 'system-ui', 'sans-serif'] },
          },
        },
      };
    `,
  });
  try {
    const t = extractTheme(dir);
    assert.equal(t.accent, "#0ea5e9");
    assert.equal(t.radius, "12px");
    assert.equal(t.fontFamily, "Poppins, system-ui, sans-serif");
    assert.match(t.source, /tailwind\.config/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("extractTheme (b2): tailwind nested color scale picks DEFAULT/500", () => {
  const dir = fixture({
    "tailwind.config.cjs": `
      module.exports = {
        theme: { colors: { primary: { 100: '#eee', 500: '#7c3aed', 900: '#111' } } },
      };
    `,
  });
  try {
    assert.equal(extractTheme(dir).accent, "#7c3aed");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("extractTheme (c): Google Fonts <link> sets googleFontHref + fontFamily", () => {
  const dir = fixture({
    "index.html": `<!doctype html><html><head>
      <link rel="preconnect" href="https://fonts.gstatic.com">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
    </head><body></body></html>`,
  });
  try {
    const t = extractTheme(dir);
    assert.equal(t.googleFontHref, "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap");
    assert.equal(t.fontFamily, "Inter, system-ui, sans-serif");
    assert.match(t.source, /index\.html/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("extractTheme (c2): multi-word Google font family + &amp; entity in href", () => {
  const dir = fixture({
    "public/index.html": `<head>
      <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400&amp;display=swap" rel="stylesheet">
    </head>`,
  });
  try {
    const t = extractTheme(dir);
    assert.equal(t.fontFamily, '"Open Sans", system-ui, sans-serif'); // spaced family gets quoted
    assert.match(t.googleFontHref, /family=Open\+Sans/);
    assert.ok(!t.googleFontHref.includes("&amp;"), "ampersand entity should be decoded");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("extractTheme (c3): <meta theme-color> is a bg fallback", () => {
  const dir = fixture({
    "index.html": `<head><meta name="theme-color" content="#0b0f19"></head>`,
  });
  try {
    assert.equal(extractTheme(dir).bg, "#0b0f19");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("extractTheme (d): empty fixture → all null fields + source 'none'", () => {
  const dir = fixture({ "README.md": "# nothing themeable here" });
  try {
    const t = extractTheme(dir);
    for (const k of ["accent", "bg", "card", "ink", "radius", "fontFamily", "googleFontHref"]) {
      assert.equal(t[k], null, `${k} should be null`);
    }
    assert.equal(t.source, "none");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("extractTheme (e): node_modules is NEVER read", () => {
  const dir = fixture({
    // A token-bearing CSS file buried in node_modules must be ignored...
    "node_modules/some-pkg/theme.css": ":root{ --primary: #ff0000; }",
    // ...while a real root token is still picked up.
    "styles.css": ":root{ --accent: #00ff00; }",
  });
  try {
    const t = extractTheme(dir);
    assert.equal(t.accent, "#00ff00", "must use the repo token, not the node_modules one");
    assert.notEqual(t.accent, "#ff0000", "node_modules token must not leak in");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("extractTheme: nonexistent path returns the all-null shape", () => {
  const t = extractTheme(join(tmpdir(), "snapfix-does-not-exist-" + Date.now()));
  assert.equal(t.source, "none");
  assert.equal(t.accent, null);
});

test("extractTheme: combined sources are joined in stable order", () => {
  const dir = fixture({
    "src/app.css": ":root{ --primary: #123456; }",
    "index.html": `<head><link href="https://fonts.googleapis.com/css2?family=Lato" rel="stylesheet"></head>`,
  });
  try {
    const t = extractTheme(dir);
    assert.equal(t.accent, "#123456");
    assert.equal(t.fontFamily, "Lato, system-ui, sans-serif");
    assert.equal(t.source, "css + index.html"); // CSS before html, stable order
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
