// snapfix — theme extraction. Pull design tokens (colors, radius, font) out of a
// target app repo so the QA board can be re-themed to match the app it watches.
//
// Design constraints (mirror create.mjs):
//   - ZERO npm deps. Node builtins only (node:fs / node:path).
//   - Pure & deterministic given inputs. No top-level side effects, no
//     process.exit, no network. Safe to import from create.mjs or a test.
//   - Windows + POSIX friendly: path.join everywhere, no bash-isms / POSIX
//     path assumptions.
//   - Best-effort & BOUNDED: we never recurse the whole tree, never execute a
//     tailwind.config (regex-scrape its text), never read node_modules/.git, and
//     cap how many files / how many bytes we touch so a giant repo can't stall.
//
// We never throw on a malformed file — a token we can't parse just stays null.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Bounds — keep extraction cheap & predictable regardless of repo size.
// ---------------------------------------------------------------------------

const MAX_FILES = 40; // total files we will read across the whole scan
const MAX_BYTES = 256 * 1024; // per-file read cap (256KB); larger files are skipped

// Directories we NEVER descend into / read from.
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".svelte-kit",
  "out",
  "coverage",
  ".cache",
]);

// ---------------------------------------------------------------------------
// Named colors — a small common subset (we don't ship the full CSS table; we
// only need enough to recognize values app authors actually write as tokens).
// ---------------------------------------------------------------------------

const NAMED_COLORS = {
  white: "#ffffff",
  black: "#000000",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  olive: "#808000",
  lime: "#00ff00",
  teal: "#008080",
  navy: "#000080",
  purple: "#800080",
  orange: "#ffa500",
  pink: "#ffc0cb",
  brown: "#a52a2a",
  transparent: null, // recognized, but not a usable theme color
};

// ---------------------------------------------------------------------------
// normalizeColor(input) — return a normalized CSS color STRING or null.
//   #rgb        → #rrggbb (expanded)
//   #rrggbb     → #rrggbb (lowercased)
//   #rrggbbaa   → #rrggbbaa (lowercased, alpha kept)
//   rgb()/rgba()→ passed through (whitespace-collapsed)
//   hsl()/hsla()→ passed through (whitespace-collapsed)
//   named       → mapped to its #rrggbb
//   anything else → null
// ---------------------------------------------------------------------------

export function normalizeColor(input) {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // Hex: #rgb, #rrggbb, #rrggbbaa (4/8-digit short/long alpha tolerated too).
  if (lower[0] === "#") {
    const hex = lower.slice(1);
    if (/^[0-9a-f]{3}$/.test(hex)) {
      // #rgb → #rrggbb
      return "#" + hex.split("").map((c) => c + c).join("");
    }
    if (/^[0-9a-f]{4}$/.test(hex)) {
      // #rgba → #rrggbbaa
      return "#" + hex.split("").map((c) => c + c).join("");
    }
    if (/^[0-9a-f]{6}$/.test(hex) || /^[0-9a-f]{8}$/.test(hex)) {
      return "#" + hex;
    }
    return null;
  }

  // Functional rgb()/rgba()/hsl()/hsla() — leave the value intact (collapse
  // internal whitespace to a single space so the emitted token is tidy).
  const fn = lower.match(/^(rgba?|hsla?)\s*\(([^)]*)\)$/);
  if (fn) {
    const args = fn[2].replace(/\s+/g, " ").trim();
    return `${fn[1]}(${args})`;
  }

  // Named color.
  if (Object.prototype.hasOwnProperty.call(NAMED_COLORS, lower)) {
    return NAMED_COLORS[lower];
  }

  return null;
}

// ---------------------------------------------------------------------------
// isLightColor(color) — perceptual lightness test (relative luminance).
// Best-effort: returns true for anything we can't parse (a light default is the
// safer assumption for "is this a light background?" callers).
// ---------------------------------------------------------------------------

export function isLightColor(color) {
  if (color == null) return true;
  const norm = normalizeColor(color);
  if (norm == null) return true;

  // hsl()/hsla() — lightness is the third comma/space-separated component (a %).
  const hsl = norm.match(/^hsla?\(([^)]*)\)$/);
  if (hsl) {
    // Accept both "h, s%, l%" and the space/slash CSS-4 form "h s% l% / a".
    const parts = hsl[1].split("/")[0].split(/[\s,]+/).filter(Boolean);
    const lRaw = parts[2];
    if (lRaw == null) return true; // unparseable → light default
    const l = parseFloat(lRaw);
    if (Number.isNaN(l)) return true;
    return l >= 50; // ≥50% lightness reads as light
  }

  // rgb()/rgba() — pull the first three numeric components.
  const rgbFn = norm.match(/^rgba?\(([^)]*)\)$/);
  let r;
  let g;
  let b;
  if (rgbFn) {
    const parts = rgbFn[1].split("/")[0].split(/[\s,]+/).filter(Boolean);
    r = channelTo255(parts[0]);
    g = channelTo255(parts[1]);
    b = channelTo255(parts[2]);
  } else if (norm[0] === "#") {
    // #rrggbb or #rrggbbaa — ignore alpha for the luminance calc.
    const hex = norm.slice(1);
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    return true;
  }
  if ([r, g, b].some((v) => v == null || Number.isNaN(v))) return true;

  // Relative luminance (sRGB, simple coefficient form). >0.5 ≈ light.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

// rgb()/rgba() channels can be "255" or "100%" — normalize to 0..255.
function channelTo255(token) {
  if (token == null) return null;
  const t = token.trim();
  if (t.endsWith("%")) {
    const p = parseFloat(t);
    return Number.isNaN(p) ? null : Math.round((p / 100) * 255);
  }
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// extractTheme(appRepoPath) — scan a bounded set of likely files and return:
//   { accent, bg, card, ink, radius, fontFamily, googleFontHref, source }
// Every field is a string or null. `source` is a short human label naming where
// tokens came from, or "none" when nothing was found.
// ---------------------------------------------------------------------------

export function extractTheme(appRepoPath) {
  const theme = {
    accent: null,
    bg: null,
    card: null,
    ink: null,
    radius: null,
    fontFamily: null,
    googleFontHref: null,
    source: "none",
  };

  // Track which inputs actually contributed a token, for the `source` label.
  const sources = new Set();
  // Shared file-budget counter threaded through every reader.
  const budget = { left: MAX_FILES };

  if (!appRepoPath || !existsSync(appRepoPath)) return theme;

  // --- 1. CSS custom properties from a shallow, bounded set of dirs/files. ---
  const cssFiles = collectCssFiles(appRepoPath, budget);
  for (const file of cssFiles) {
    const text = readCapped(file);
    if (text == null) continue;
    if (applyCssVars(text, theme)) sources.add("css");
  }

  // --- 2. Tailwind config (TEXT scrape — never executed). ---
  for (const name of ["tailwind.config.js", "tailwind.config.cjs", "tailwind.config.mjs", "tailwind.config.ts"]) {
    if (budget.left <= 0) break;
    const file = join(appRepoPath, name);
    if (!existsSync(file)) continue;
    const text = readCapped(file);
    budget.left--;
    if (text == null) continue;
    if (applyTailwind(text, theme)) sources.add("tailwind.config");
    break; // one config wins
  }

  // --- 3. index.html: <meta theme-color> (bg fallback) + Google Fonts link. ---
  for (const rel of ["index.html", join("public", "index.html"), join("src", "index.html")]) {
    if (budget.left <= 0) break;
    const file = join(appRepoPath, rel);
    if (!existsSync(file)) continue;
    const text = readCapped(file);
    budget.left--;
    if (text == null) continue;
    if (applyHtml(text, theme)) sources.add("index.html");
  }

  // Build a short human source string ("tailwind.config + index.html"), or
  // "none" when no input contributed.
  if (sources.size) {
    // Stable, readable order regardless of discovery order.
    const order = ["css", "tailwind.config", "index.html"];
    theme.source = order.filter((s) => sources.has(s)).join(" + ");
  }

  return theme;
}

// ---------------------------------------------------------------------------
// File discovery — shallow, bounded, node_modules/.git/dist/build excluded.
// We look for *.css at the repo root and one level inside a small allowlist of
// conventional source dirs.
// ---------------------------------------------------------------------------

const CSS_DIRS = ["", "src", "styles", "style", "app", "public", "assets", join("src", "styles")];

function collectCssFiles(root, budget) {
  const found = [];
  for (const sub of CSS_DIRS) {
    if (budget.left <= 0) break;
    const dir = sub ? join(root, sub) : root;
    if (!isReadableDir(dir)) continue;
    // Refuse to descend into excluded dirs even if one was somehow listed.
    const base = sub.split(/[\\/]/).pop() || "";
    if (SKIP_DIRS.has(base)) continue;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (budget.left <= 0) break;
      if (!ent.isFile()) continue;
      if (!/\.css$/i.test(ent.name)) continue;
      found.push(join(dir, ent.name));
      budget.left--;
    }
  }
  return found;
}

function isReadableDir(p) {
  try {
    return existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Read a file, but skip anything larger than MAX_BYTES (read & truncate to the
// cap rather than refusing, so a big bundled stylesheet still yields its head).
// Returns null on any error.
function readCapped(file) {
  try {
    const size = statSync(file).size;
    const text = readFileSync(file, "utf8");
    return size > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CSS custom property mapping. First match wins per field (we never overwrite a
// field already set). Color tokens run through normalizeColor; radius is a
// length, kept as-is.
// ---------------------------------------------------------------------------

// token name (without leading --) → theme field. Order within a field's list is
// the search priority. Names are matched case-insensitively.
const CSS_VAR_MAP = {
  accent: ["primary", "accent", "brand", "color-primary", "ring"],
  bg: ["background", "bg", "color-background"],
  card: ["card", "surface", "panel"],
  ink: ["foreground", "text", "ink", "color-text", "body"],
  radius: ["radius", "rounded", "border-radius"],
};

// Returns true if this CSS text contributed at least one token.
function applyCssVars(text, theme) {
  let contributed = false;
  // Build a lookup of every --name: value; declaration in the file. Last write
  // wins within a file (CSS cascade-ish), which matches how authors expect a
  // later :root override to take precedence.
  const declared = new Map();
  const declRe = /--([a-z0-9-]+)\s*:\s*([^;}]+)\s*[;}]/gi;
  let m;
  while ((m = declRe.exec(text)) !== null) {
    declared.set(m[1].toLowerCase(), m[2].trim());
  }
  if (!declared.size) return false;

  for (const [field, names] of Object.entries(CSS_VAR_MAP)) {
    if (theme[field] != null) continue; // first match across files wins
    for (const name of names) {
      if (!declared.has(name)) continue;
      const value = stripImportant(declared.get(name));
      if (field === "radius") {
        if (value) {
          theme.radius = value;
          contributed = true;
        }
      } else {
        const color = normalizeColor(firstColorToken(value));
        if (color) {
          theme[field] = color;
          contributed = true;
        }
      }
      if (theme[field] != null) break; // matched this field; stop scanning names
    }
  }
  return contributed;
}

// Strip a trailing !important (and surrounding space) from a declaration value.
function stripImportant(v) {
  return String(v).replace(/!important\s*$/i, "").trim();
}

// A CSS value can be "var(--x, #fff)" or "#fff /* note */"; pull the first
// recognizable color-ish token so normalizeColor has a clean string. We try the
// whole value first (so functional rgb()/hsl() survive), then fall back to the
// first hex / named word.
function firstColorToken(value) {
  const v = String(value).trim();
  if (normalizeColor(v)) return v;
  // Functional notation possibly embedded with trailing junk.
  const fn = v.match(/(rgba?|hsla?)\s*\([^)]*\)/i);
  if (fn) return fn[0];
  // Hex.
  const hex = v.match(/#[0-9a-f]{3,8}\b/i);
  if (hex) return hex[0];
  // First bare word (could be a named color).
  const word = v.match(/[a-z]+/i);
  return word ? word[0] : v;
}

// ---------------------------------------------------------------------------
// Tailwind config TEXT scrape (regex; we DO NOT execute the file). Best-effort.
// We look for colors.primary (or theme.extend.colors.primary), borderRadius,
// and fontFamily.sans.
// ---------------------------------------------------------------------------

function applyTailwind(text, theme) {
  let contributed = false;

  // accent ← a `primary`/`accent`/`brand` color key with a string value. Tailwind
  // color values can be a string ('#fff') or a nested scale ({ 500: '#fff' });
  // we grab a simple string value or a `500`/`DEFAULT` shade if present.
  if (theme.accent == null) {
    const color =
      tailwindColorValue(text, "primary") ||
      tailwindColorValue(text, "accent") ||
      tailwindColorValue(text, "brand");
    const norm = normalizeColor(color);
    if (norm) {
      theme.accent = norm;
      contributed = true;
    }
  }

  // bg ← a `background` color key (only as a fallback; CSS vars win earlier).
  if (theme.bg == null) {
    const norm = normalizeColor(tailwindColorValue(text, "background"));
    if (norm) {
      theme.bg = norm;
      contributed = true;
    }
  }

  // radius ← borderRadius.DEFAULT / .lg / first string value under borderRadius.
  if (theme.radius == null) {
    const r = tailwindFirstString(text, "borderRadius");
    if (r) {
      theme.radius = r;
      contributed = true;
    }
  }

  // fontFamily ← fontFamily.sans (string or array's first entry).
  if (theme.fontFamily == null) {
    const fam = tailwindFontSans(text);
    if (fam) {
      theme.fontFamily = withFallbackStack(fam);
      contributed = true;
    }
  }

  return contributed;
}

// Find `key: '<value>'` or `key: "<value>"` where value is a single string —
// used for a flat color like `primary: '#6d28d9'`.
function tailwindColorValue(text, key) {
  // Flat string: primary: '#fff'
  const flat = new RegExp(`\\b${key}\\s*:\\s*(['"\`])([^'"\`]+)\\1`, "i");
  const fm = text.match(flat);
  if (fm) {
    const v = fm[2].trim();
    if (normalizeColor(v)) return v;
  }
  // Nested scale: primary: { ... 500: '#fff' ... } — grab DEFAULT then 500.
  const nested = new RegExp(`\\b${key}\\s*:\\s*\\{([\\s\\S]*?)\\}`, "i");
  const nm = text.match(nested);
  if (nm) {
    const body = nm[1];
    const def = body.match(/\bDEFAULT\s*:\s*(['"`])([^'"`]+)\1/i);
    if (def && normalizeColor(def[2])) return def[2].trim();
    const five = body.match(/\b500\s*:\s*(['"`])([^'"`]+)\1/i);
    if (five && normalizeColor(five[2])) return five[2].trim();
    // Otherwise the first string value in the scale.
    const any = body.match(/:\s*(['"`])([^'"`]+)\1/);
    if (any && normalizeColor(any[2])) return any[2].trim();
  }
  return null;
}

// First string value inside a `key: { ... }` block (e.g. borderRadius.DEFAULT).
function tailwindFirstString(text, key) {
  const block = new RegExp(`\\b${key}\\s*:\\s*\\{([\\s\\S]*?)\\}`, "i");
  const bm = text.match(block);
  if (bm) {
    const def = bm[1].match(/\bDEFAULT\s*:\s*(['"`])([^'"`]+)\1/i);
    if (def) return def[2].trim();
    const any = bm[1].match(/:\s*(['"`])([^'"`]+)\1/);
    if (any) return any[2].trim();
  }
  // Or a flat `borderRadius: '0.5rem'`.
  const flat = new RegExp(`\\b${key}\\s*:\\s*(['"\`])([^'"\`]+)\\1`, "i");
  const fm = text.match(flat);
  if (fm) return fm[2].trim();
  return null;
}

// fontFamily.sans — value may be a string or an array; return the first family.
function tailwindFontSans(text) {
  const block = text.match(/fontFamily\s*:\s*\{([\s\S]*?)\}/i);
  const scope = block ? block[1] : text;
  // sans: ['Inter', 'system-ui', ...]  → 'Inter'
  const arr = scope.match(/\bsans\s*:\s*\[\s*(['"`])([^'"`]+)\1/i);
  if (arr) return arr[2].trim();
  // sans: 'Inter'
  const str = scope.match(/\bsans\s*:\s*(['"`])([^'"`]+)\1/i);
  if (str) return str[2].trim();
  return null;
}

// ---------------------------------------------------------------------------
// index.html scrape — <meta name="theme-color"> + Google Fonts <link>.
// ---------------------------------------------------------------------------

function applyHtml(text, theme) {
  let contributed = false;

  // Google Fonts link → googleFontHref + fontFamily (family parsed from href).
  // <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap">
  const linkRe = /<link\b[^>]*href\s*=\s*(['"])(https:\/\/fonts\.googleapis\.com\/css2?\?[^'"]+)\1[^>]*>/i;
  const linkM = text.match(linkRe);
  if (linkM) {
    const href = decodeEntities(linkM[2]);
    if (theme.googleFontHref == null) {
      theme.googleFontHref = href;
      contributed = true;
    }
    const fam = familyFromGoogleHref(href);
    if (fam && theme.fontFamily == null) {
      theme.fontFamily = withFallbackStack(fam);
      contributed = true;
    }
  }

  // theme-color meta → bg fallback (only if bg not already set). Attribute order
  // varies, so match name=theme-color and content separately.
  if (theme.bg == null) {
    const metaRe = /<meta\b[^>]*>/gi;
    let mm;
    while ((mm = metaRe.exec(text)) !== null) {
      const tag = mm[0];
      if (!/name\s*=\s*(['"])theme-color\1/i.test(tag)) continue;
      const content = tag.match(/content\s*=\s*(['"])([^'"]+)\1/i);
      if (!content) continue;
      const color = normalizeColor(content[2].trim());
      if (color) {
        theme.bg = color;
        contributed = true;
      }
      break;
    }
  }

  // font-family in an inline <style> block → fontFamily fallback.
  if (theme.fontFamily == null) {
    const ff = text.match(/font-family\s*:\s*([^;}<]+)/i);
    if (ff) {
      const fam = firstFontName(ff[1]);
      if (fam) {
        theme.fontFamily = withFallbackStack(fam);
        contributed = true;
      }
    }
  }

  return contributed;
}

// Parse the family name from a Google Fonts css2 href:
//   ...?family=Inter:wght@400;700  → "Inter"
//   ...?family=Open+Sans&...        → "Open Sans"
function familyFromGoogleHref(href) {
  const m = href.match(/[?&]family=([^&]+)/i);
  if (!m) return null;
  // The family segment ends at the first ':' (axis spec) if present.
  let fam = decodeURIComponent(m[1]).split(":")[0];
  fam = fam.replace(/\+/g, " ").trim();
  return fam || null;
}

// Extract the first quoted-or-bare family name from a font-family value.
function firstFontName(value) {
  const first = String(value).split(",")[0].trim();
  // Strip surrounding quotes.
  const unq = first.replace(/^['"]|['"]$/g, "").trim();
  // Skip generic/system keywords as a "primary" family.
  if (/^(inherit|initial|unset|system-ui|sans-serif|serif|monospace)$/i.test(unq)) return null;
  return unq || null;
}

// Append a sensible fallback stack to a bare family name. If the family already
// contains a comma (a full stack), keep it as-is.
function withFallbackStack(family) {
  if (family.includes(",")) return family;
  const quoted = /\s/.test(family) ? `"${family}"` : family;
  return `${quoted}, system-ui, sans-serif`;
}

// Minimal HTML entity decode for href attributes (&amp; is the common one).
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}
