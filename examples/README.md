# snapfix examples

A minimal app you can point snapfix at to try the loop **end to end** — file a bug from the board, let the AI fix the real code, verify the proof. No build, no dependencies, no framework.

## `hello-static/`

A single self-contained HTML page: a heading, a counter, a reset button, one card. It is deliberately small so you can read every line — and it **ships with one obvious bug on purpose** so the fix-issues loop has something real to fix.

> **The planted bug:** the counter button is labeled **"Decrement"** but clicking it **increments**. The mismatch is marked in `index.html` with an `<!-- intentional demo bug: ... -->` comment. That's your demo target: file it, fix it, watch the card flip.

Everything here is dependency-free and runs on Node ≥ 18 builtins — same ethos as the rest of snapfix.

## Try the loop in four steps

### 1. Serve the app

Any static server works. The example config expects port **3000**:

```bash
npx serve examples/hello-static
# → http://localhost:3000
```

(`python3 -m http.server 3000 -d examples/hello-static` or any other static server is fine — just keep the port matching `app.devServer` in the config below.)

### 2. Stand up a board against it

From the `examples/hello-static/` directory:

```bash
cd examples/hello-static
npx github:shakeebshaan/snapfix init
```

That creates the two GitHub repos, deploys the board to Pages, and writes `qa.config.json` + the `fix-issues` skill into this folder. A ready-made config is bundled here as **`qa.config.example.json`** — it already targets `http://localhost:3000`, a `390x844` mobile viewport, `auth: none`, and a loop with `satisfaction: 80` and `tests.required: false` (the static demo has no test suite, so the loop leans on the satisfaction judge alone). Copy it over if you'd rather not run `init`:

```bash
cp qa.config.example.json qa.config.json
```

### 3. File the bug from the board

Open your board URL (`https://<owner>.github.io/hello-static-qa/`) on your phone or in a browser, connect a token (see the main [README → Setup details](../README.md#setup-details)), snap the counter screen, and describe it: *"button says Decrement but it counts up."* It lands as `Submitted`.

### 4. Run the loop

In this directory, kick the fix-issues skill:

```bash
claude -p "/fix-issues"
```

The agent pulls the open issue, fixes the real code in `index.html` (relabel the button, or flip the handler — its call), recaptures the screen for before/after proof, self-scores against the `80` satisfaction bar, and posts a **Proposed fix** card. Open the board and **✓ Resolve** it.

That's the whole loop — trigger → goal → proof → human verify — on an app you can hold in your head.

---

See the root [README.md](../README.md) for board setup and tokens, and [LOOP.md](../LOOP.md) for the full trigger + goal model.
