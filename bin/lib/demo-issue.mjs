// snapfix — demo "test issue" seeder (pure, zero-dep).
//
// The one-line setup seeds ONE friendly smoke-test issue onto the board so the
// user instantly sees the screenshot→AI-fix loop work, and an agent has
// something to react to. The board reads data/issues.json ({version,issues})
// and renders each issue via cardHtml/shotsHtml in template/index.html.
//
// Design constraints (load-bearing, mirror create.mjs):
//   - ESM, Node builtins ONLY (in fact: no imports needed — fully pure).
//   - NO top-level side effects, NO process.exit.
//   - DETERMINISTIC: never calls new Date(); the caller passes `nowIso`.
//   - Cross-platform; no path or shell assumptions.
//
// Schema honored (see template/index.html `d.issues.push({...})` + cardHtml):
//   imagePaths: [] renders with NO image tile (shotsHtml returns "" when the
//   paths array is empty), giving a clean, image-less demo card.

// Stable id so re-running setup is idempotent (no duplicate demo issues).
export const DEMO_ID = "i-demo-snapfix";

// Deterministic fallback timestamp. Callers SHOULD pass a real ISO string;
// this only guards a falsy `nowIso` so the output stays deterministic.
const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

// Multi-line, friendly description. Marked "[snapfix demo]" so isDemoIssue can
// recognize it even on boards seeded before the `demo` flag existed, and so the
// agent knows exactly what to do.
const DEMO_DESCRIPTION = [
  "[snapfix demo] This is a seeded smoke-test issue.",
  "",
  "It verifies your screenshot → AI-fix loop is wired end-to-end: the board",
  "renders, an agent can read this issue, and a fix can be posted back here.",
  "",
  "Agent: if there's no real bug at this route, reply on the board that the",
  "loop is working and you're ready. Otherwise, fix the SMALLEST real issue",
  "you can see here and post before/after proof on this card.",
].join("\n");

// Build the demo issue object. Pure: identical inputs → identical output.
//   owner   → becomes `author` (omitted when falsy, matching the form flow).
//   route   → the route the demo points at; defaults to "/".
//   nowIso  → ISO createdAt; falls back to EPOCH_ISO when falsy.
//   project → accepted for forward-compat / caller symmetry; not yet rendered.
export function buildDemoIssue({ owner, route, nowIso, project } = {}) {
  return {
    id: DEMO_ID,
    createdAt: nowIso || EPOCH_ISO,
    route: route || "/",
    description: DEMO_DESCRIPTION,
    author: owner || undefined,
    tags: ["snapfix", "demo"],
    imagePath: null, imageCommit: null,
    imagePaths: [], imageCommits: [],   // [] ⇒ no image tile (clean demo card)
    imagePrivate: false,
    status: "open",
    fix: null,
    history: [],
    demo: true,                          // marker flag for isDemoIssue / cleanup
  };
}

// True when an issue is (or looks like) the seeded demo. Three signals so old
// boards and hand-edited issues are still recognized:
//   1. the stable DEMO_ID, 2. the `demo` marker flag, 3. the "[snapfix demo]"
//   description prefix.
export function isDemoIssue(issue) {
  if (!issue || typeof issue !== "object") return false;
  return (
    issue.id === DEMO_ID ||
    issue.demo === true ||
    (typeof issue.description === "string" &&
      issue.description.startsWith("[snapfix demo]"))
  );
}

// Return a NEW db ({version,issues}) with the demo issue seeded. Never mutates
// `db`. Null/missing db starts from a fresh {version:1,issues:[]}. Idempotent:
// any existing demo-looking issue is REPLACED (not duplicated); otherwise the
// demo is PREPENDED so it shows at/near the top. `version` + other issues are
// preserved in their original order.
export function seedDemoIssue(db, issue) {
  const base = db && typeof db === "object" ? db : { version: 1, issues: [] };
  const version = base.version ?? 1;
  const existing = Array.isArray(base.issues) ? base.issues : [];

  const kept = existing.filter((it) => !isDemoIssue(it));
  return { ...base, version, issues: [issue, ...kept] };
}
