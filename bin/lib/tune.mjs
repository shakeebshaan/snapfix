// snapfix — loop auto-tuner. Pure, deterministic, zero-dependency helpers that
// derive sensible `loop` defaults from detected project signals. create.mjs
// imports these to tune the resolved config before it builds qa.config.json.
//
// Design constraints (load-bearing, mirror create.mjs):
//   - ZERO runtime npm deps. Node builtins only (none needed here).
//   - PURE: no I/O, no top-level side effects, no process.exit. Every function
//     is deterministic in its inputs so it's trivially unit-testable.
//   - Cross-platform: no path/shell assumptions.
//
// Key names MUST agree with create.mjs's loop config shape:
//   loop.action.pollSeconds  ← resolveTick   ("tick duration": poll cadence)
//   loop.trigger             ← resolveTrigger ("manual"|"schedule"|"action")
//   app.viewport             ← resolveViewport ("WIDTHxHEIGHT")
//   loop.goal.satisfaction   ← tuneSatisfaction (0–100 LLM-judge bar)
//
// `signals` is a small bag of booleans derived from framework detection, e.g.
//   { isWeb, hasTests, desktop }. autoTune accepts the flat `resolved`/base
//   object create.mjs already builds (pollSeconds/trigger/viewport/satisfaction
//   as flat fields) and returns a tuned clone.

// ---------------------------------------------------------------------------
// Tick bounds — the watch trigger polls the board for new issues every N
// seconds. Floor 5s (avoid hammering the GitHub API); ceiling 1 day.
// ---------------------------------------------------------------------------

const TICK_MIN = 5;
const TICK_MAX = 86400;

// Clamp helper — coerce to an integer inside [lo, hi]. NaN/garbage → lo.
function clampInt(n, lo, hi) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

// ---------------------------------------------------------------------------
// resolveTick(tickArg, signals) → integer seconds for loop.action.pollSeconds.
//   - Explicit tickArg (number or numeric string) > 0 wins, clamped to bounds.
//   - Else derive from signals: a served web app polls often (60s); a
//     library/CLI rarely changes from a user's POV (300s); fallback 60.
// ---------------------------------------------------------------------------

export function resolveTick(tickArg, signals = {}) {
  // Explicit override: accept finite numbers and numeric strings only. A
  // non-numeric string (e.g. "fast") falls through to the signal default.
  const n = typeof tickArg === "string" ? tickArg.trim() : tickArg;
  if (n !== undefined && n !== null && n !== "") {
    const num = Number(n);
    if (Number.isFinite(num) && num > 0) return clampInt(num, TICK_MIN, TICK_MAX);
  }
  // Signal-derived default.
  const def = signals.isWeb ? 60 : 300;
  return clampInt(def, TICK_MIN, TICK_MAX);
}

// ---------------------------------------------------------------------------
// resolveTrigger(args, signals) → "manual" | "schedule" | "action".
//   - Explicit args.trigger (one of the three) wins.
//   - --auto (one-line autonomous setup): watch for new issues ("action") on a
//     served web app, else run on a cadence ("schedule").
//   - Without --auto: stay out of the way ("manual").
// ---------------------------------------------------------------------------

const TRIGGERS = new Set(["manual", "schedule", "action"]);

export function resolveTrigger(args = {}, signals = {}) {
  if (TRIGGERS.has(args.trigger)) return args.trigger;
  if (args.auto) return signals.isWeb ? "action" : "schedule";
  return "manual";
}

// ---------------------------------------------------------------------------
// resolveViewport(signals) → "WIDTHxHEIGHT".
//   - Desktop-oriented apps (electron, or an explicit desktop signal) → 1280x800.
//   - Everything else (web / mobile-first) → 390x844, the existing default.
// ---------------------------------------------------------------------------

export function resolveViewport(signals = {}) {
  const fw = String(signals.framework || "").toLowerCase();
  if (signals.desktop || fw.includes("electron")) return "1280x800";
  return "390x844";
}

// ---------------------------------------------------------------------------
// tuneSatisfaction(signals) → integer 0–100 for loop.goal.satisfaction.
//
// Reasoning: the loop has two gates — a verifiable test gate AND the
// LLM-as-judge bar. When real tests exist (hasTests) the judge isn't the only
// thing standing between a bad fix and the board, so the default 80 is enough.
// With NO tests the judge is the SOLE gate, so we raise the bar to 85 to
// compensate for the missing objective floor. Always clamped to [0,100].
// ---------------------------------------------------------------------------

export function tuneSatisfaction(signals = {}) {
  const bar = signals.hasTests ? 80 : 85;
  return clampInt(bar, 0, 100);
}

// ---------------------------------------------------------------------------
// autoTune(base, signals, args) → a NEW object: a shallow clone of `base` with
// the four tuned fields overwritten and `tuned: true` added. Does NOT mutate
// `base`. All other fields are preserved as-is.
// ---------------------------------------------------------------------------

export function autoTune(base = {}, signals = {}, args = {}) {
  return {
    ...base,
    pollSeconds: resolveTick(args.tick, signals),
    trigger: resolveTrigger(args, signals),
    viewport: resolveViewport(signals),
    satisfaction: tuneSatisfaction(signals),
    tuned: true,
  };
}
