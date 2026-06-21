---
name: seo-geo-visibility
title: SEO/GEO Visibility Loop
category: Content
trigger: schedule (weekly) — or manual on demand
goal: verifiable — no critical technical issues remain in the crawl
source: Loop Library video (verbatim prompt)
---

## What it does

Audits a site for both classic **SEO** (how search engines crawl, index, and rank it)
and **GEO** — Generative Engine Optimization, how AI answer engines find, trust, and
cite it. It ranks the gaps it finds, fixes the highest-leverage ones, then **reruns the
exact same crawl** and repeats. The crawl is the judge: the loop only stops when a clean
pass shows no critical technical issues left.

## Trigger

Scheduled weekly is the sweet spot — sites drift, and a fresh crawl each week catches
regressions before they cost you rankings or citations. Run it manually any time you ship
a content or template change.

```bash
# Manual, one pass (Claude Code):
claude -p "/loops/seo-geo-visibility"

# Weekly via the snapfix runner — point agentCmd at this loop, then schedule it:
node tools/loop.mjs schedule --cron "0 9 * * 1"   # Mondays 09:00; prints the OS-scheduler line to install
```

Set `loop.schedule.agentCmd` in `qa.config.json` to the agent invocation above so the
runner kicks the right loop on the cron tick.

## Goal

**Verifiable.** "Done" is a deterministic crawl result: a full pass with **zero
critical technical issues** outstanding (broken/blocked crawl paths, non-indexable pages
that should index, missing or duplicate titles, orphaned pages, invalid structured data,
absent source citations, buried answers). The same crawl is rerun after each fix batch;
the loop exits the first time that crawl comes back clean of criticals. Lower-severity
items are reported but do not block the stopping condition — keep the bar at *critical* so
the loop converges instead of chasing cosmetics forever.

## Prompt

```text
Run an SEO/GEO audit across crawlability, indexation, page intent, titles, internal links, structured data, source citations, and answer-first content. Rank the gaps, fix the highest-leverage issues, rerun the same crawl, and repeat until no critical technical issues remain.
```

## Notes / caveats

- **Same crawl, every pass.** The loop only converges if the rerun is identical to the
  first crawl (same crawler, same depth, same URL set). Change the crawl and you lose the
  before/after comparison that defines "done."
- **Keep "critical" tight.** Broaden the stopping bar to include every minor warning and
  the loop can run indefinitely. Criticals stop the loop; nice-to-haves go in the report.
- **Token cost.** A multi-pass crawl-fix-recrawl cycle over a large site is long-running
  and token-hungry — budget for several full passes. Scope to a section or a sitemap
  subset for big sites.
- **Fixes touch real code/content.** Title, structured-data, and internal-link changes
  edit templates and pages; review the diff like any other change before it ships.
- **When NOT to use it.** Skip for brand-new sites with little content (there's nothing to
  rank yet), or when the work is net-new content creation rather than fixing existing
  pages — this loop converges on technical gaps, not on writing from scratch.
