---
name: boeing-747-benchmark
title: Boeing 747 benchmark
category: Design
trigger: manual (on demand)
goal: both (visual benchmark) — nine-angle render scores clear the visual threshold, stall, or hit budget
source: Loop Library — https://signals.forwardfuture.ai/loop-library/loops/boeing-747-benchmark/
---

## What it does

A vision benchmark in which an agent builds a Boeing 747 from Three.js primitives,
renders nine repeatable angles, and fixes what each view reveals. Up front it picks
reference images, a scoring rubric, a `[visual threshold]`, and a `[budget]`. It builds
the most realistic 747 it can from primitives, then stands up a **rig that screenshots
nine repeatable angles**. After every change it re-renders and rescores the same views, a
critic names the weakest feature, and the agent fixes it **without regressing stronger
views**. It keeps the best version and stops at the threshold, stalled progress, or
budget.

## Trigger

Manual. Paste the prompt into a CLI agent, filling the brackets first:

```bash
claude -p "Before building, choose reference images, a scoring rubric, [visual threshold], and [budget]. Build the most realistic Boeing 747 you can from Three.js primitives, then create a rig that screenshots nine repeatable angles. After each change, render and score the same views, have a critic identify the weakest feature, and fix it without regressing stronger views. Keep the best version. Stop at the threshold, stalled progress, or budget. Finish with the model, nine renders, scores, remaining gaps, and run summary."
```

## Goal

**Both.** "Done" means: the nine-angle render set scores at or above `[visual threshold]`
under the chosen rubric — *or* progress stalls, *or* `[budget]` is spent. Verifiable
spine: the **nine angles are repeatable**, re-rendered identically every pass so scores
are comparable and a regression on a strong view is detectable. LLM-as-judge spine: a
critic scores realism against the reference images and picks the weakest feature to fix
next. The loop keeps whichever version scored best.

## Prompt

```text
Before building, choose reference images, a scoring rubric, [visual threshold], and [budget]. Build the most realistic Boeing 747 you can from Three.js primitives, then create a rig that screenshots nine repeatable angles. After each change, render and score the same views, have a critic identify the weakest feature, and fix it without regressing stronger views. Keep the best version. Stop at the threshold, stalled progress, or budget. Finish with the model, nine renders, scores, remaining gaps, and run summary.
```

## Notes / caveats

**The repeatable rig is the load-bearing part.** "Score the same views" only means
anything if the nine camera angles, lighting, and resolution are fixed across passes.
Lock the rig before the first render — a drifting camera turns the score history into
noise and the loop can't tell a fix from a regression.

**"Realistic" is LLM-as-judge and brittle.** A critic grading realism against reference
photos will wobble run to run. Anchor it with verifiable floors: a fixed rubric with
explicit feature checks (nose profile, wing dihedral, engine count/placement), pixel-diff
or SSIM against a reference render per angle, and a no-regression rule on already-strong
views so the score can't be gamed by trading one feature for another.

**Token cost is high and the budget cap is mandatory.** Build-render-score-fix over nine
views per pass is expensive. The `[budget]` and stalled-progress exits are what stop an
asymptotic chase for the last 5% of realism — fill them in, don't leave them open.

**When NOT to use it.** This is a benchmark, not production work. Use it to compare models
or measure an agent's vision-and-iterate ability — not as a way to ship a 3D asset on a
deadline.
