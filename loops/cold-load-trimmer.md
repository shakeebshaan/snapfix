---
name: cold-load-trimmer
title: Cold-load trimmer
category: Engineering
trigger: manual (run on a web app with a heavy first load)
goal: verifiable (bytes) — no safe candidate left that shrinks transferred bytes with tests green and screenshots pixel-identical
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/cold-load-trimmer-loop/
---

## What it does

Cuts the bytes a web app downloads before its first screen paints. The agent first records
the baseline — passing tests, mobile and desktop screenshots, and the *compressed
transferred* bytes (the data actually downloaded, not source size). It uses the build
report only to suggest candidates, then defers, compresses, or removes one item, rebuilds,
and reruns every check. A change survives only if tests pass, screenshots stay
pixel-identical, and bytes drop; otherwise it's reverted. It repeats until no safe
candidate is left.

## Trigger

Manual. Run it when first-visit payload is too heavy and you want it lighter without
regressing the UI. Use any CLI agent:

```text
claude -p "/cold-load-trimmer"
```

Or as a one-shot tick through the snapfix runner, overriding the agent command for this loop:

```text
node tools/loop.mjs run --agent 'claude -p "Reduce the data [web app] downloads before its first screen appears. First record passing tests, mobile and desktop screenshots, and compressed transferred bytes. Use the build report only to suggest candidates. Defer, compress, or remove one item, then rebuild and rerun every check. Keep it only if tests pass, screenshots are pixel-identical, and bytes decrease; otherwise revert. Stop when no safe candidate remains, progress stalls, or approval is needed. Return measurements, changes, and untested states."'
```

## Goal

**Verifiable (bytes).** "Done" means: no safe candidate remains that reduces compressed
transferred bytes while keeping tests green and every captured screen pixel-identical. The
loop also stops if progress stalls or approval is needed. Three gates decide whether each
change is kept: tests pass, screenshots are pixel-identical, bytes decrease — fail any one
and it reverts.

## Prompt

```text
Reduce the data [web app] downloads before its first screen appears. First record passing tests, mobile and desktop screenshots, and compressed transferred bytes—the data actually downloaded. Use the build report only to suggest candidates. Defer, compress, or remove one item, then rebuild and rerun every check. Keep it only if tests pass, screenshots are pixel-identical, and bytes decrease; otherwise revert. Stop when no safe candidate remains, progress stalls, or approval is needed. Return measurements, changes, and untested states.
```

## Notes / caveats

**Measure compressed transferred bytes, not source files.** The whole metric is *network*
data over the wire after gzip/brotli — shrinking a source file that compresses away buys
nothing. Make sure the agent's byte measurement comes from the network panel / actual
transfer, or the gate is meaningless.

**Screenshots only protect what you capture.** Pixel-identical is only as safe as the
states you snapshot. Capture multiple first-screen scenarios — logged-out, logged-in,
empty, and error states — or the agent can "safely" strip something that only the
uncaptured state needed.

**Untested states are explicit risk.** The loop returns its untested states for a reason:
browsers, viewports, and interactions you didn't capture are unverified. Treat the report's
caveats as a review checklist before shipping.

**When NOT to use it.** Skip it if you have no reliable build report and no screenshot/byte
baseline to diff against — without those three gates this becomes guesswork. And it's a
cold-load trimmer, not a full perf overhaul: it won't fix runtime jank or slow APIs.
