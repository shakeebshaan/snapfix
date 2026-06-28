#!/usr/bin/env node
// metrics-collect.mjs — assembles the NYUS metrics dashboard from REAL sources:
//   1. prod MySQL DB  (via ssh -> nyu_backend/metrics_db.py)   product/growth/finance/AI/support/security/social/health
//   2. GA4 Data API   (service-account JWT, property 518021566) web traffic / organic / AEO / content
//   3. prod health     (curl /api/v1/health)                    uptime
// Every metric in the deep-research report is represented. Live metrics carry a
// real value; metrics that need an owner-provided integration carry
// status:"awaiting" + a `need` string (NO mock numbers, ever). Writes data/metrics.json.
//
//   node tools/metrics-collect.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createSign } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.USERPROFILE || process.env.HOME;
// Infra config is read from a GITIGNORED local file (never committed) so this
// collector is a safe, reusable template — no secrets/IPs in the repo. Copy
// tools/metrics.config.example.json -> data/metrics.config.local.json and fill it.
// Env vars (METRICS_SSH_HOST etc.) override the file. Each project wires its own
// db query script + data sources; the dashboard UI that renders metrics.json is
// fully generic.
let CFG = {};
for (const p of [join(ROOT, "data", "metrics.config.local.json"), join(ROOT, "tools", "metrics.config.local.json")]) {
  if (existsSync(p)) { try { CFG = JSON.parse(readFileSync(p, "utf8")); break; } catch {} }
}
const cfg = (k, d) => process.env["METRICS_" + k.toUpperCase()] || CFG[k] || d;
const KEY = cfg("sshKey", `${HOME}\\Desktop\\saveNYUS_ORACLE.ppk`);
const HOSTKEY = cfg("sshHostkey", "");
const HOST = cfg("sshHost", "");
const DB_CMD = cfg("dbCommand", "cd ~/nyu_backend && ./venv/bin/python metrics_db.py 2>/dev/null | tail -1");
const GA4_PROPERTY = cfg("ga4Property", "");
const AUDIT_DIR = cfg("auditDir", "");
const GA4_SA = [process.env.GA4_SA_JSON, CFG.ga4SaPath, `${HOME}\\Desktop\\nyus-ga4-sa.json`, `${HOME}\\Desktop\\NYUSLANDING\\scripts\\ga4-sa.json`].find(p => p && existsSync(p));

const warn = [];

// ── 1. prod DB ─────────────────────────────────────────────
function pullDb() {
  if (!HOST || !HOSTKEY) { warn.push("db: ssh host/hostkey not configured (metrics.config.local.json)"); return {}; }
  try {
    const out = execFileSync("plink", ["-batch", "-hostkey", HOSTKEY, "-i", KEY, HOST, DB_CMD],
      { encoding: "utf8", timeout: 120000, maxBuffer: 8 << 20 });
    return JSON.parse(out.trim().split("\n").pop());
  } catch (e) { warn.push("db: " + String(e.message || e).slice(0, 120)); return {}; }
}

// ── 2. GA4 (self-contained SA-JWT, no deps) ────────────────
const b64url = (s) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function ga4Token(sa) {
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: sa.client_email, scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
  const signed = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claim))}`;
  const sig = createSign("RSA-SHA256").update(signed).end().sign(sa.private_key);
  const jwt = `${signed}.${sig.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  const r = await fetchT("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
  const j = await r.json();
  if (!j.access_token) throw new Error("ga4 token: " + JSON.stringify(j).slice(0, 120));
  return j.access_token;
}
async function fetchT(url, opt = {}, ms = 25000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ac.signal }); } finally { clearTimeout(t); }
}
async function ga4Run(token, body) {
  const r = await fetchT(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}
async function pullGa4() {
  if (!GA4_SA) { warn.push("ga4: no SA json found"); return null; }
  try {
    const sa = JSON.parse(readFileSync(GA4_SA, "utf8"));
    const token = await ga4Token(sa);
    const totals = await ga4Run(token, { dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "engagementRate" }] });
    const channels = await ga4Run(token, { dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }] });
    const pages = await ga4Run(token, { dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }], limit: 8, orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }] });
    const t = totals.rows?.[0]?.metricValues?.map(v => v.value) || [];
    const chan = {}; (channels.rows || []).forEach(r => chan[r.dimensionValues[0].value] = +r.metricValues[0].value);
    const topPages = {}; (pages.rows || []).forEach(r => topPages[r.dimensionValues[0].value.slice(0, 48)] = +r.metricValues[0].value);
    return { activeUsers_30d: +t[0] || 0, sessions_30d: +t[1] || 0, pageViews_30d: +t[2] || 0,
      engagementRate: t[3] ? +(+t[3] * 100).toFixed(1) : null, channels: chan, topPages,
      organic_30d: chan["Organic Search"] || 0, aeo_ai_assistant_30d: chan["AI Assistant"] || 0 };
  } catch (e) { warn.push("ga4: " + String(e.message || e).slice(0, 120)); return null; }
}

// ── 3b. dependency vulnerabilities (npm audit, free — no third-party) ──
function pullVuln() {
  if (!AUDIT_DIR || !existsSync(AUDIT_DIR)) return null;
  try {
    // npm audit exits non-zero when vulns exist → capture stdout regardless.
    let out = "";
    try { out = execFileSync("npm", ["audit", "--json"], { cwd: AUDIT_DIR, encoding: "utf8", timeout: 90000, maxBuffer: 32 << 20, shell: true }); }
    catch (e) { out = e.stdout || ""; }
    const v = JSON.parse(out).metadata?.vulnerabilities;
    if (!v) return null;
    return { critical: v.critical || 0, high: v.high || 0, moderate: v.moderate || 0, low: v.low || 0, total: v.total || 0 };
  } catch (e) { warn.push("vuln: " + String(e.message || e).slice(0, 120)); return null; }
}

// ── 3. prod health ─────────────────────────────────────────
function pullHealth() {
  if (!HOST || !HOSTKEY) return {};
  try {
    const out = execFileSync("plink", ["-batch", "-hostkey", HOSTKEY, "-i", KEY, HOST,
      "curl -s -o /dev/null -w '%{http_code} %{time_total}' http://127.0.0.1:5000/api/v1/health; echo; systemctl is-active nyu-backend; grep -cE 'Traceback|ERROR|CRITICAL' ~/nyu_backend/nyus_app.log 2>/dev/null || echo 0"],
      { encoding: "utf8", timeout: 60000 });
    const [hl, svc, errs] = out.trim().split("\n");
    const [code, t] = (hl || "").split(" ");
    return { health_http: +code || null, health_latency_s: +t || null, service: (svc || "").trim(), errors_today: +(errs || 0) };
  } catch (e) { warn.push("health: " + String(e.message || e).slice(0, 120)); return {}; }
}

// ── assemble ───────────────────────────────────────────────
const A = (need) => ({ status: "awaiting", need });
function num(v) { return (v === null || v === undefined) ? null : v; }

// AI factual-accuracy eval (server-side LLM call). EXPENSIVE (8 LLM calls), so
// run at most ONCE/DAY: reuse the previous metrics.json's aiEval if <20h old.
const PRIV_EARLY = cfg("privRepo", process.env.QA_PRIV_REPO || "");
function ghGetJson(path) {
  try {
    const r = JSON.parse(execFileSync("gh", ["api", `repos/${PRIV_EARLY}/contents/${path}`], { encoding: "utf8", timeout: 45000, maxBuffer: 16 << 20 }));
    return JSON.parse(Buffer.from(r.content.replace(/\s/g, ""), "base64").toString("utf8"));
  } catch { return null; }
}
function pullAiEval() {
  if (!HOST || !HOSTKEY) return null;
  try {
    const out = execFileSync("plink", ["-batch", "-hostkey", HOSTKEY, "-i", KEY, HOST,
      "cd ~/nyu_backend && ./venv/bin/python metrics_ai_eval.py 2>/dev/null | tail -1"],
      { encoding: "utf8", timeout: 120000, maxBuffer: 8 << 20 });
    return JSON.parse(out.trim().split("\n").pop());
  } catch (e) { warn.push("aieval: " + String(e.message || e).slice(0, 100)); return null; }
}

const db = pullDb();
const ga4 = await pullGa4();
const health = pullHealth();
const vuln = pullVuln();
let aiEval = null;
{
  const prev = (ghGetJson("data/metrics.json") || {}).aiEval;
  if (prev && prev.at && (Date.now() - Date.parse(prev.at) < 20 * 3600 * 1000)) aiEval = prev; // reuse (<20h)
  else { const e = pullAiEval(); aiEval = e ? { accuracy_pct: e.accuracy_pct, hallucination_pct: e.hallucination_pct, total: e.total, at: new Date().toISOString().replace(/\.\d+Z$/, "Z") } : (prev || null); }
}

const m = (key, label, value, opt = {}) => ({ key, label, value: value === undefined ? null : value,
  status: (value && value.status === "awaiting") ? "awaiting" : (value === null || value === undefined ? "nodata" : "live"),
  unit: opt.unit || "", formula: opt.formula || "", source: opt.source || "", owner: opt.owner || "", priority: opt.priority || "" });

const sub = db.subscriptions || {};
const ai = db.ai || {};
const fa = db.feature_adoption_30d || {};
const fn = db.funnel || {};
const sup = db.support || {};
const sec = db.security || {};
const soc = db.social_community || {};
const seg = db.segmentation || {};
const eng = db.engagement_extra || {};
const web = db.web_content || {};
const exp = db.experiments || {};
const gd = db.gdpr || {};

const categories = [
  { key: "product_growth", title: "Product & Growth", metrics: [
    m("users_total", "Total users", num(db.users_total), { source: "DB users", owner: "Product", priority: "H" }),
    m("users_new_today", "New users today", num(db.users_new_today), { source: "DB users.created_at", owner: "Growth", priority: "H" }),
    m("users_new_7d", "New users (7d)", num(db.users_new_7d), { source: "DB users.created_at", owner: "Growth", priority: "H" }),
    m("users_new_30d", "New users (30d)", num(db.users_new_30d), { source: "DB users.created_at", owner: "Growth", priority: "H" }),
    m("activation_rate", "Activation rate", num(db.activation_rate_pct), { unit: "%", formula: "onboarding_complete ÷ verified", source: "DB users", owner: "PM", priority: "H" }),
    m("dau", "DAU", num(db.dau), { formula: "distinct session users (1d)", source: "DB user_sessions", owner: "Growth", priority: "M" }),
    m("wau", "WAU", num(db.wau), { source: "DB user_sessions", owner: "Growth", priority: "M" }),
    m("mau", "MAU", num(db.mau), { source: "DB user_sessions", owner: "Growth", priority: "M" }),
    m("stickiness", "Stickiness (DAU/MAU)", num(db.stickiness_dau_mau_pct), { unit: "%", formula: "DAU ÷ MAU", source: "DB", owner: "Growth", priority: "M" }),
    m("retention_d1", "Retention D1", db.retention_d1 ? db.retention_d1.pct : null, { unit: "%", formula: "returned on day 1 ÷ cohort", source: "DB cohort", owner: "Growth", priority: "H" }),
    m("retention_d7", "Retention D7", db.retention_d7 ? db.retention_d7.pct : null, { unit: "%", source: "DB cohort", owner: "Growth", priority: "H" }),
    m("retention_d30", "Retention D30", db.retention_d30 ? db.retention_d30.pct : null, { unit: "%", source: "DB cohort", owner: "Growth", priority: "H" }),
    m("nsm_workouts_7d", "North Star: workouts completed (7d)", num(db.workouts_completed_7d), { source: "DB workout_session_logs", owner: "PM", priority: "H" }),
    m("nsm_meals_7d", "Meals logged (7d)", num(db.meals_logged_7d), { source: "DB meal_logs", owner: "PM", priority: "M" }),
    m("adopt_meal", "Feature adoption: meal logging", num(fa.meal_logging_pct), { unit: "% of MAU", source: "DB", owner: "PM", priority: "M" }),
    m("adopt_workout", "Feature adoption: workouts", num(fa.workout_pct), { unit: "% of MAU", source: "DB", owner: "PM", priority: "M" }),
    m("adopt_weight", "Feature adoption: weight logging", num(fa.weight_pct), { unit: "% of MAU", source: "DB", owner: "PM", priority: "M" }),
    m("funnel", "Funnel signup→verify→onboard→subscribe", fn.signups != null ? `${fn.signups}→${fn.verified}→${fn.onboarded}→${fn.subscribed}` : null, { formula: "counts; rates in detail", source: "DB", owner: "Growth", priority: "H" }),
  ]},
  { key: "finance", title: "Finance & Monetization", metrics: [
    m("active_subs", "Active subscriptions", num(sub.active), { source: "DB subscriptions", owner: "Finance", priority: "H" }),
    m("trialing", "Trialing", num(sub.trialing), { source: "DB subscriptions", owner: "Finance", priority: "M" }),
    m("sub_revenue", "Subscription revenue (active, gross)", sub.mrr_minor_units != null ? +(sub.mrr_minor_units / 100).toFixed(2) : null, { unit: "₹", formula: "Σ amount_paid (active) ÷ 100", source: "DB subscriptions", owner: "Finance", priority: "H" }),
    m("churn_30d", "Churn (30d)", num(sub.churn_30d_pct), { unit: "%", formula: "canceled_30d ÷ active_at_start", source: "DB subscriptions", owner: "Finance", priority: "H" }),
    m("arpu", "ARPU", A("Stripe/Razorpay payment history for true monthly revenue normalization (subscriptions table has gross amount only)"), { formula: "Revenue ÷ users", owner: "Finance", priority: "H" }),
    m("ltv", "LTV", A("ARPU × avg lifetime — needs payment history + churn curve"), { owner: "Finance", priority: "H" }),
    m("cac", "CAC / payback", A("Ad-spend by channel (Google/Meta Ads) — connect ad platforms"), { owner: "Growth", priority: "H" }),
  ]},
  { key: "ai", title: "AI System", metrics: [
    m("ai_calls_30d", "AI calls (30d)", num(ai.calls_30d), { source: "DB llm_interaction_logs", owner: "AI", priority: "M" }),
    m("ai_calls_today", "AI calls today", num(ai.calls_today), { source: "DB", owner: "AI", priority: "M" }),
    m("ai_latency_p50", "AI latency p50", num(ai.latency_p50_ms), { unit: "ms", source: "DB", owner: "AI/Infra", priority: "H" }),
    m("ai_latency_p95", "AI latency p95", num(ai.latency_p95_ms), { unit: "ms", source: "DB", owner: "AI/Infra", priority: "H" }),
    m("ai_error_rate", "AI error rate (30d)", num(ai.error_rate_30d_pct), { unit: "%", source: "DB", owner: "Infra", priority: "M" }),
    m("ai_cost_30d", "AI cost (30d)", num(ai.cost_usd_30d), { unit: "$", formula: "Σ cost_usd", source: "DB", owner: "AI/Finance", priority: "H" }),
    m("ai_cost_today", "AI cost today", num(ai.cost_usd_today), { unit: "$", source: "DB", owner: "Finance", priority: "H" }),
    m("ai_tokens_30d", "Tokens (30d)", num(ai.tokens_30d), { source: "DB", owner: "AI", priority: "M" }),
    m("ai_safety", "Safety-flagged responses (30d)", num(ai.safety_flagged_30d), { source: "DB content_safety_flagged", owner: "AI", priority: "M" }),
    m("ai_injection", "Prompt-injections detected (30d)", num(ai.injection_detected_30d), { source: "DB injection_detected", owner: "Security", priority: "M" }),
    m("ai_accuracy", "AI factual accuracy", aiEval ? aiEval.accuracy_pct : A("eval harness"), { unit: aiEval ? `% (${aiEval.total}-Q daily eval)` : "", formula: "correct ÷ total on a fixed health-fact set (BMR/macros/nutrition)", source: "metrics_ai_eval.py (live LLM)", owner: "AI/DS", priority: "H" }),
    m("ai_hallucination", "AI hallucination rate", aiEval ? aiEval.hallucination_pct : A("An eval harness scoring AI answers vs computed ground truth"), { unit: aiEval ? "%" : "", formula: "wrong ÷ total on the fixed eval set", source: "metrics_ai_eval.py (live LLM)", owner: "AI/DS", priority: "H" }),
  ]},
  { key: "marketing_seo", title: "Marketing, SEO & AEO", metrics: [
    m("organic_30d", "Organic search sessions (30d)", ga4 ? ga4.organic_30d : null, { source: "GA4 channel", owner: "SEO", priority: "H" }),
    m("aeo_ai_assistant", "AEO: AI-assistant referrals (30d)", ga4 ? ga4.aeo_ai_assistant_30d : null, { formula: "GA4 'AI Assistant' channel (ChatGPT etc.)", source: "GA4", owner: "Marketing", priority: "H" }),
    m("ga4_sessions", "Web sessions (30d)", ga4 ? ga4.sessions_30d : null, { source: "GA4", owner: "Marketing", priority: "M" }),
    m("ga4_users", "Web active users (30d)", ga4 ? ga4.activeUsers_30d : null, { source: "GA4", owner: "Marketing", priority: "M" }),
    m("ga4_engagement", "Web engagement rate", ga4 ? ga4.engagementRate : null, { unit: "%", source: "GA4", owner: "Content", priority: "M" }),
    m("gsc_impressions", "Search Console impressions / CTR / position", A("Google Search Console API: add the SA email as a GSC user + enable the Search Console API (see board issue)"), { owner: "SEO", priority: "H" }),
    m("keyword_rankings", "Keyword rankings (web/app)", A("GSC for web + an ASO tool (AppTweak/SEMrush) for app keywords"), { owner: "Marketing", priority: "M" }),
    m("backlinks", "Backlinks (count / authority)", A("Ahrefs or Moz API key, or GSC Links report export"), { owner: "SEO", priority: "L" }),
    m("paid_ads", "Paid: CPI / CAC / ROAS", A("Connect Google Ads / Meta Ads (UTMs → GA4) — only if running paid campaigns"), { owner: "Growth", priority: "H" }),
  ]},
  { key: "app_store", title: "App Store (ASO)", metrics: [
    m("in_app_rating", "In-app rating (avg stars)", num(sup.avg_stars), { unit: "★", source: "DB app_feedback", owner: "PM", priority: "H" }),
    m("store_cvr", "Play Store conversion (impressions→installs)", A("Play Console reporting (bulk CSV in the linked GCS bucket) or the Play Developer Reporting API — enable for the service account"), { owner: "PM", priority: "H" }),
    m("installs", "Installs (Play/App Store)", A("Play Console statistics / App Store Connect Analytics — grant the SA reporting access"), { owner: "Marketing", priority: "H" }),
    m("store_reviews", "Store reviews & ratings", A("Play Developer API reviews.list + App Store Connect — enable reviews scope for the SA"), { owner: "Support", priority: "H" }),
  ]},
  { key: "health_data", title: "Health-Data Accuracy", metrics: [
    m("weight_logs_30d", "Weight logs (30d)", num(db.weight_logs_30d), { source: "DB weight_log", owner: "Data", priority: "L" }),
    m("hr_accuracy", "Heart-rate accuracy (% error)", A("Lab/clinical comparison data or user-calibrated HR vs chest-strap"), { owner: "Data Science", priority: "M" }),
    m("calorie_accuracy", "Calorie-burn accuracy (% error)", A("Indirect-calorimetry reference or weight-trend back-calc study"), { owner: "Data Science", priority: "M" }),
  ]},
  { key: "social_community", title: "Social & Community", metrics: [
    m("friendships", "Friendships (in-app)", num(soc.friendships_total), { source: "DB friendships", owner: "Community", priority: "L" }),
    m("dms_30d", "Direct messages (30d)", num(soc.direct_messages_30d), { source: "DB direct_messages", owner: "Community", priority: "L" }),
    m("group_msgs_30d", "Group messages (30d)", num(soc.group_messages_30d), { source: "DB group_messages", owner: "Community", priority: "L" }),
    m("active_challenges", "Active challenges", num(soc.active_challenges), { source: "DB challenges", owner: "Community", priority: "L" }),
    m("social_engagement", "Social platform engagement rate / followers", A("FB/Instagram/TikTok Graph APIs — connect the brand social accounts (not yet created per prior note)"), { owner: "Social", priority: "M" }),
  ]},
  { key: "support", title: "Support", metrics: [
    m("feedback_30d", "In-app feedback (30d)", num(sup.feedback_30d), { source: "DB app_feedback", owner: "Support", priority: "M" }),
    m("feedback_comments", "Feedback with comments", num(sup.feedback_with_comment), { source: "DB app_feedback", owner: "Support", priority: "L" }),
    m("tickets_open", "Open support tickets", num(sup.support_tickets_open), { source: "DB admin_support_tickets", owner: "Support", priority: "M" }),
    m("csat", "CSAT / NPS / resolution time", A("A support tool (Zendesk/Intercom) or structured in-app CSAT survey + resolution timestamps"), { owner: "Support", priority: "M" }),
  ]},
  { key: "security", title: "Security & Privacy", metrics: [
    m("sec_events_30d", "Security events (30d, by severity)", sec.events_30d_by_severity ? Object.entries(sec.events_30d_by_severity).map(([k, v]) => `${k}:${v}`).join(" ") : null, { source: "DB security_event_logs", owner: "Security", priority: "M" }),
    m("otp_30d", "OTP requests (30d)", num(sec.otp_requests_30d), { source: "DB otps", owner: "Security", priority: "L" }),
    m("vuln_count", "Open high-severity vulnerabilities", vuln ? (vuln.high + vuln.critical) : A("set auditDir in metrics.config.local.json (free npm audit) or provide a Snyk token"), { unit: vuln ? `high+crit (${vuln.total} total: ${vuln.critical}C/${vuln.high}H/${vuln.moderate}M/${vuln.low}L)` : "", formula: "npm audit high+critical", source: "npm audit", owner: "Security", priority: "H" }),
    m("privacy_consents", "Privacy consent opt-in rate", A("Consent events instrumented in-app (ATT/GDPR prompt outcomes)"), { owner: "Compliance", priority: "M" }),
  ]},
  { key: "infra", title: "Infrastructure & Ops", metrics: [
    m("uptime", "Prod health", health.service === "active" && health.health_http === 200 ? "healthy" : (health.service || "unknown"), { source: "curl /health + systemd", owner: "DevOps", priority: "H" }),
    m("health_latency", "Health endpoint latency", num(health.health_latency_s), { unit: "s", source: "curl", owner: "DevOps", priority: "M" }),
    m("errors_today", "Backend errors today (log)", num(health.errors_today), { source: "nyus_app.log", owner: "Engineering", priority: "H" }),
    m("scheduler_jobs", "Scheduler jobs", num((db.infra_db || {}).scheduler_jobs), { source: "DB apscheduler_jobs", owner: "DevOps", priority: "M" }),
    m("deploys_30d", "Deploys (30d)", num((db.infra_db || {}).deploy_log_30d), { source: "DB admin_deploy_log", owner: "DevOps", priority: "L" }),
  ]},
  { key: "analytics", title: "Analytics & Segmentation", metrics: [
    m("seg_goal", "Users by goal type", seg.by_goal_type ? Object.entries(seg.by_goal_type).map(([k, v]) => `${k}:${v}`).join(" ") : null, { source: "DB user_health_profiles", owner: "Data", priority: "M" }),
    m("seg_gender", "Users by gender", seg.by_gender ? Object.entries(seg.by_gender).map(([k, v]) => `${k}:${v}`).join(" ") : null, { source: "DB", owner: "Data", priority: "M" }),
    m("seg_activity", "Users by activity level", seg.by_activity_level ? Object.entries(seg.by_activity_level).map(([k, v]) => `${k}:${v}`).join(" ") : null, { source: "DB", owner: "Data", priority: "L" }),
    m("top_pages", "Top web pages (30d)", web.top_pages_30d ? Object.keys(web.top_pages_30d).length + " pages" : null, { source: "DB page_views", owner: "Content", priority: "M" }),
    m("experiments", "Active A/B experiments", num(exp.active), { formula: "distinct experiment_id (user_experiment_assignments)", source: "DB user_experiment_assignments", owner: "PM", priority: "M" }),
  ]},
  { key: "engagement", title: "Engagement & Gamification", metrics: [
    m("active_streaks", "Active streaks", num(eng.active_streaks), { source: "DB user_streaks", owner: "Product", priority: "M" }),
    m("prs_30d", "Personal records set (30d)", num(eng.personal_records_30d), { source: "DB personal_records", owner: "Product", priority: "L" }),
    m("badges_total", "Badges earned (total)", num(eng.badges_earned_total), { source: "DB user_badges", owner: "Product", priority: "L" }),
    m("waitlist", "Waitlist signups", num(eng.waitlist_signups), { source: "DB waitlist_signups", owner: "Marketing", priority: "L" }),
  ]},
  { key: "competitors_legal", title: "Competitors & Legal", metrics: [
    m("competitor_share", "Competitor downloads / revenue", A("Sensor Tower / data.ai estimates (paid) — manual quarterly research"), { owner: "Strategy", priority: "L" }),
    m("gdpr_requests", "GDPR/DPDP requests (30d)", num(gd.requests_30d), { source: "DB admin_gdpr_requests", owner: "Legal", priority: "M" }),
    m("privacy_incidents", "Privacy incident rate", A("Incident log (0 = none reported); wire to a tracked table when an incident process exists"), { owner: "Legal", priority: "H" }),
  ]},
];

const liveCount = categories.flatMap(c => c.metrics).filter(x => x.status === "live").length;
const awaitingCount = categories.flatMap(c => c.metrics).filter(x => x.status === "awaiting").length;
const total = categories.flatMap(c => c.metrics).length;

const metrics = {
  generatedAt: db._generated_at || new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  periodDays: 30,
  summary: { total, live: liveCount, awaiting: awaitingCount, nodata: total - liveCount - awaitingCount },
  sources: { db: !!db.users_total, ga4: !!ga4, health: !!health.service },
  warnings: warn,
  aiEval,
  detail: { funnel: fn, ai_by_model: ai.by_model || {}, ga4_channels: ga4 ? ga4.channels : {}, ga4_top_pages: ga4 ? ga4.topPages : {}, top_pages_db: web.top_pages_30d || {}, retention: { d1: db.retention_d1, d7: db.retention_d7, d30: db.retention_d30 }, sub_by_currency: sub.mrr_by_currency || {} },
  categories,
};

// metrics.json holds SENSITIVE business data (revenue, user counts, AI cost), so
// it is NOT committed to the public board repo. It is uploaded to the PRIVATE
// repo (nyus-qa-private/data/metrics.json) and the board fetches it client-side
// with the owner's token (same model as private screenshots/reports).
const payload = JSON.stringify(metrics, null, 2);
const tmp = join(ROOT, "tmp", "metrics.json");
writeFileSync(tmp, payload);
const PRIV = cfg("privRepo", process.env.QA_PRIV_REPO || "");
if (!PRIV) { console.error("No private repo configured (metrics.config.local.json privRepo). metrics.json kept at tmp/."); process.exit(1); }
const PRIV_PATH = "data/metrics.json";
function ghJson(args) { return JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 16 << 20, timeout: 45000 })); }
function ghPut(path, contentObj, msg) {
  let sha;
  try { sha = ghJson(["api", `repos/${PRIV}/contents/${path}`]).sha; } catch {}
  const b64 = Buffer.from(JSON.stringify(contentObj, null, 2)).toString("base64");
  const body = join(ROOT, "tmp", "put-" + path.replace(/[\/.]/g, "_") + ".json");
  writeFileSync(body, JSON.stringify({ message: msg, content: b64, ...(sha ? { sha } : {}) }));
  execFileSync("gh", ["api", "--method", "PUT", `repos/${PRIV}/contents/${path}`, "--input", body], { encoding: "utf8", timeout: 45000 });
}
// One DAILY snapshot of key scalars -> metrics-history.json (last 180 days) for
// trend charts. Runs hourly but dedupes by date, so history stays one-point-per-day.
function appendHistory() {
  const date = (metrics.generatedAt || "").slice(0, 10);
  const snap = { date,
    users_total: db.users_total ?? null, users_new: db.users_new_today ?? null,
    dau: db.dau ?? null, wau: db.wau ?? null, mau: db.mau ?? null,
    activation: db.activation_rate_pct ?? null,
    active_subs: sub.active ?? null, sub_revenue: sub.mrr_minor_units != null ? +(sub.mrr_minor_units / 100).toFixed(2) : null,
    ai_calls: ai.calls_today ?? null, ai_cost: ai.cost_usd_today ?? null, ai_p95: ai.latency_p95_ms ?? null,
    organic: ga4 ? ga4.organic_30d : null, aeo: ga4 ? ga4.aeo_ai_assistant_30d : null,
    web_sessions: ga4 ? ga4.sessions_30d : null,
    workouts_7d: db.workouts_completed_7d ?? null, meals_7d: db.meals_logged_7d ?? null,
    vuln_high: vuln ? (vuln.high + vuln.critical) : null, errors_today: health.errors_today ?? null,
    ai_accuracy: aiEval ? aiEval.accuracy_pct : null };
  let hist = [];
  try { hist = JSON.parse(b64FromGh(ghJson(["api", `repos/${PRIV}/contents/data/metrics-history.json`]))); } catch {}
  if (!Array.isArray(hist)) hist = [];
  hist = hist.filter(h => h.date !== date);
  hist.push(snap);
  hist.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (hist.length > 180) hist = hist.slice(-180);
  ghPut("data/metrics-history.json", hist, `metrics-history: ${date}`);
  return hist.length;
}
function b64FromGh(resp) { return Buffer.from(resp.content.replace(/\s/g, ""), "base64").toString("utf8"); }

try {
  ghPut(PRIV_PATH, metrics, `metrics: refresh ${metrics.generatedAt}`);
  let hpts = 0;
  try { hpts = appendHistory(); } catch (e) { warn.push("history: " + String(e.message || e).slice(0, 100)); }
  console.log(`metrics.json -> PRIVATE ${PRIV}:${PRIV_PATH} | ${total} metrics (${liveCount} live, ${awaitingCount} awaiting) | history ${hpts}d | db=${metrics.sources.db} ga4=${metrics.sources.ga4} health=${metrics.sources.health}`);
} catch (e) {
  console.error("PRIVATE upload failed (metrics.json kept at tmp/):", String(e.message || e).slice(0, 160));
  process.exitCode = 1;
}
if (warn.length) console.log("warnings:", warn);
