#!/usr/bin/env node
// snapfix — generic Playwright recapture.
//
// Re-captures a screenshot of one route of the app under test so the
// fix-issues skill can post before/after proof. Config-driven: everything
// it needs comes from qa.config.json (found by walking up from cwd).
//
//   USAGE:   node recapture.mjs <route> <outPath>
//   EXAMPLE: node recapture.mjs /dashboard ./tmp/i-20260619-ab12-fix.png
//
// This matches the default qa.config.json reproduce.recaptureCmd:
//   "node recapture.mjs {route} {out}"
//
// ENV VARS:
//   QA_JWT   — required only when auth.strategy === "seeded-jwt". The token is
//              written to localStorage[auth.tokenKey] before navigating to the
//              protected route.
//
// STDERR MARKERS (the skill greps stderr for these exact tokens):
//   PLAYWRIGHT_MISSING — `playwright` is not installed in the app project.
//   JWT_EXPIRED        — seeded-jwt strategy but no QA_JWT, or the seeded token
//                        bounced us to the login page (token rejected/expired).
//   NAV_FAILED         — navigation to the route failed (server down, bad route,
//                        timeout, network error).
//   MANUAL_AUTH        — auth.strategy === "manual-otp": interactive login can't
//                        run here; use the skill's Playwright-MCP path instead.
//
// EXIT CODES:
//   0  success — screenshot written to outPath
//   2  PLAYWRIGHT_MISSING
//   3  bad usage / unreadable config
//   4  JWT_EXPIRED
//   5  NAV_FAILED
//   6  MANUAL_AUTH (non-fatal-by-design: this path is simply out of scope here)
//
// Zero deps beyond `playwright` (resolved from the APP project, not the board).
// ESM, Windows-friendly (no bash-isms, path.join everywhere).

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join, isAbsolute } from "node:path";

const EXIT = {
  OK: 0,
  PLAYWRIGHT_MISSING: 2,
  USAGE: 3,
  JWT_EXPIRED: 4,
  NAV_FAILED: 5,
  MANUAL_AUTH: 6,
};

function die(marker, message, code) {
  // Marker on its own line first (easy to grep), then a human hint.
  if (marker) console.error(marker);
  if (message) console.error(message);
  process.exit(code);
}

// ---- args -----------------------------------------------------------------
const [, , routeArg, outArg] = process.argv;
if (!routeArg || !outArg) {
  die(
    null,
    "Usage: node recapture.mjs <route> <outPath>\n" +
      "  <route>   path on the dev server, e.g. /dashboard\n" +
      "  <outPath> file to write the PNG to, e.g. ./tmp/fix.png",
    EXIT.USAGE
  );
}
// Normalize the route to a leading-slash path; tolerate a bare "dashboard".
const route = routeArg.startsWith("/") || /^https?:\/\//i.test(routeArg)
  ? routeArg
  : "/" + routeArg;
const outPath = isAbsolute(outArg) ? outArg : resolve(process.cwd(), outArg);

// ---- locate + read qa.config.json (walk up from cwd) ----------------------
function findConfig(startDir) {
  let dir = resolve(startDir);
  // Guard against an infinite loop at the filesystem root.
  for (let i = 0; i < 64; i++) {
    const candidate = join(dir, "qa.config.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const configPath = findConfig(process.cwd());
if (!configPath) {
  die(
    null,
    "Could not find qa.config.json (walked up from " + process.cwd() + ").\n" +
      "Run snapfix init, or create qa.config.json (see qa.config.example.json).",
    EXIT.USAGE
  );
}

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (e) {
  die(null, "Could not parse " + configPath + ":\n" + e.message, EXIT.USAGE);
}

const app = config.app || {};
const auth = config.auth || {};
const devServer = (app.devServer || "http://localhost:5173").replace(/\/+$/, "");
const viewport = parseViewport(app.viewport || "390x844");
const strategy = auth.strategy || "none";
const tokenKey = auth.tokenKey || "access_token";
const loginUrl = auth.loginUrl || "/";

function parseViewport(spec) {
  const m = String(spec).trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!m) return { width: 390, height: 844 };
  return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
}

// ---- manual-otp short-circuit (interactive auth is out of scope here) -----
if (strategy === "manual-otp") {
  die(
    "MANUAL_AUTH",
    "auth.strategy is 'manual-otp'. This non-interactive recapture script cannot\n" +
      "drive an OTP login. Use the fix-issues skill's Playwright-MCP path, which\n" +
      "asks the human for the OTP, then capture the proof there.",
    EXIT.MANUAL_AUTH
  );
}

// ---- seeded-jwt requires a token up front ---------------------------------
const jwt = process.env.QA_JWT;
if (strategy === "seeded-jwt" && !jwt) {
  die(
    "JWT_EXPIRED",
    "auth.strategy is 'seeded-jwt' but QA_JWT is not set in the environment.\n" +
      "Set QA_JWT to a valid access token, e.g.  QA_JWT=<token> node recapture.mjs " +
      route + " " + outArg,
    EXIT.JWT_EXPIRED
  );
}

// ---- resolve Playwright from the APP project ------------------------------
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  die(
    "PLAYWRIGHT_MISSING",
    "Could not import 'playwright'. Install it in the app project:\n" +
      "  npm i -D playwright && npx playwright install chromium",
    EXIT.PLAYWRIGHT_MISSING
  );
}

// ---- capture --------------------------------------------------------------
const targetUrl = /^https?:\/\//i.test(route) ? route : devServer + route;

mkdirSync(dirname(outPath), { recursive: true });

let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  // Seed the JWT before hitting the protected route. localStorage is
  // origin-scoped, so we must visit the app origin first (loginUrl is cheap
  // and same-origin), set the token, THEN navigate to the real route.
  if (strategy === "seeded-jwt") {
    const seedUrl = /^https?:\/\//i.test(loginUrl) ? loginUrl : devServer + loginUrl;
    try {
      await page.goto(seedUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (e) {
      await safeClose(browser);
      die("NAV_FAILED", "Failed to reach app origin (" + seedUrl + "): " + e.message, EXIT.NAV_FAILED);
    }
    await page.evaluate(
      ([k, v]) => {
        try { window.localStorage.setItem(k, v); } catch {}
      },
      [tokenKey, jwt]
    );
  }

  // Navigate to the route under test.
  try {
    await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 45000 });
  } catch (e) {
    // networkidle can legitimately time out on apps with long-lived sockets
    // (Socket.IO, SSE). Fall back to a load-state nav before declaring failure.
    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (e2) {
      await safeClose(browser);
      die("NAV_FAILED", "Navigation to " + targetUrl + " failed: " + (e2.message || e.message), EXIT.NAV_FAILED);
    }
  }

  // Short settle for late renders / animations / lazy chunks.
  await page.waitForTimeout(1200);

  // Detect a bounce to the login page under seeded-jwt — the token was
  // rejected or expired. Heuristic: we asked for a protected route but the
  // app redirected us to the login URL (path-compare, query/hash-agnostic).
  if (strategy === "seeded-jwt") {
    const landedPath = await page.evaluate(() => window.location.pathname);
    const loginPath = (() => {
      try {
        return new URL(loginUrl, devServer).pathname.replace(/\/+$/, "") || "/";
      } catch {
        return loginUrl;
      }
    })();
    const wantedPath = (() => {
      try {
        return new URL(targetUrl).pathname.replace(/\/+$/, "") || "/";
      } catch {
        return route;
      }
    })();
    const landedNorm = (landedPath || "/").replace(/\/+$/, "") || "/";
    if (landedNorm === loginPath && wantedPath !== loginPath) {
      await safeClose(browser);
      die(
        "JWT_EXPIRED",
        "Seeded JWT was rejected — landed on the login page (" + landedNorm + ") instead of " + wantedPath + ".\n" +
          "Mint a fresh token and retry with QA_JWT=<token>.",
        EXIT.JWT_EXPIRED
      );
    }
  }

  await page.screenshot({ path: outPath, fullPage: true });
  await safeClose(browser);
  console.log(outPath);
  process.exit(EXIT.OK);
} catch (e) {
  await safeClose(browser);
  // Unclassified failure: still surface NAV_FAILED so the skill's grep catches
  // it and treats the capture as not-produced.
  die("NAV_FAILED", "Recapture failed: " + (e && e.message ? e.message : String(e)), EXIT.NAV_FAILED);
}

async function safeClose(b) {
  try { if (b) await b.close(); } catch {}
}
