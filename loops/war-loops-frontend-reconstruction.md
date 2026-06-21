---
name: war-loops-frontend-reconstruction
title: War-loops frontend reconstruction
category: Design
trigger: manual (on demand, per URL/image)
goal: verifiable (visual match) — every fidelity gate passes, progress stalls, or capture is blocked
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/war-loops-frontend-designer/
---

## What it does

A War Loops workflow that captures a real page, builds a static Pencil mirror and moving
Forge version, then repairs the weakest fidelity signals. Pointed at an authorized URL or
image, it captures the target with a **genuine browser** and records layout, styles,
content, motion, and responsive behavior. It then builds two reconstructions — a static
Pencil mirror and a moving Forge version — and compares both against the source at
desktop, tablet, and mobile sizes, **repairing only the weakest fidelity signals** each
pass. It stops when every gate passes, progress stalls, or capture is blocked.

## Trigger

Manual, per target. Paste the prompt into a CLI agent (it needs browser-capture access):

```bash
claude -p "Point War Loops at an authorized URL or image. Capture it with a genuine browser and record the layout, styles, content, motion, and responsive behavior. Build a static Pencil mirror and a moving Forge version. Compare both with the source at desktop, tablet, and mobile sizes; repair only the weakest fidelity signals. Stop when every gate passes, progress stalls, or capture is blocked. Finish with the builds, spec, renders, scores, and remaining gaps."
```

## Goal

**Verifiable (visual match).** "Done" means: every fidelity gate passes across the three
breakpoints (desktop, tablet, mobile) for both the static and moving builds — *or*
progress stalls, *or* capture is blocked. Each pass measures the reconstruction against
the captured source and repairs only the **weakest** signal, so the loop converges on the
biggest gap instead of polishing what already matches.

## Prompt

```text
Point War Loops at an authorized URL or image. Capture it with a genuine browser and record the layout, styles, content, motion, and responsive behavior. Build a static Pencil mirror and a moving Forge version. Compare both with the source at desktop, tablet, and mobile sizes; repair only the weakest fidelity signals. Stop when every gate passes, progress stalls, or capture is blocked. Finish with the builds, spec, renders, scores, and remaining gaps.
```

## Notes / caveats

**"Authorized URL" is not a suggestion.** This loop clones a live page's frontend. Only
point it at pages you own or have explicit permission to reproduce — capturing and
mirroring someone else's design can be a legal and ToS problem.

**Fidelity is verifiable here — keep it that way.** Comparison against a captured source
is a real pixel/layout match, not a vibe. That's the strength: anchor the gates on
measurable signals (per-breakpoint screenshot diff, computed-style match, DOM/content
parity) rather than a critic's "looks close." The "repair only the weakest signal" rule
keeps it converging instead of chasing cosmetics forever.

**Capture can block the whole loop.** A genuine-browser capture trips on auth walls, bot
detection, lazy-loaded content, and animation timing. If capture is blocked the loop
exits by design — don't mistake that for a fidelity failure. Static motion and responsive
reflow are the hardest signals to match; expect those to dominate the remaining-gaps list.

**When NOT to use it.** Skip for pages behind login or aggressive anti-bot, for
heavily dynamic/personalized pages where there is no single stable source to match, and
when you want a redesign rather than a faithful reconstruction — this loop optimizes for
*match*, not improvement.
