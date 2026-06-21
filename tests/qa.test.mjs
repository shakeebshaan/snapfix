// Unit tests for the pure, exported helper in template/tools/qa.mjs.
// SNAPFIX_NO_MAIN keeps the CLI inert on import (no config load, no dispatch).
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SNAPFIX_NO_MAIN = "1";
const { buildPullEntry } = await import("../template/tools/qa.mjs");

// Contract: the [snapfix demo] seed is image-less (imagePaths: [], imagePath:
// null). pull must NOT throw join(ROOT, null) on it — that would abort the whole
// pull and break the --auto demo. (Regression: P1 from the adversarial review.)
test("buildPullEntry: image-less issue → image null, images [], never throws", () => {
  const i = {
    id: "i-demo-snapfix", createdAt: "2026-06-21T00:00:00.000Z", route: "/",
    description: "[snapfix demo]", imagePaths: [], imagePath: null, imagePrivate: false,
    status: "open", history: [],
  };
  const e = buildPullEntry(i, "/board", () => { throw new Error("dl must not be called"); });
  assert.equal(e.image, null);
  assert.deepEqual(e.images, []);
  assert.equal(e.id, "i-demo-snapfix");
  assert.equal(e.imagePrivate, false);
});

test("buildPullEntry: public issue joins each path under root", () => {
  const e = buildPullEntry({ id: "x", imagePaths: ["images/a.jpg", "images/b.jpg"], imagePrivate: false }, "/board", () => null);
  assert.equal(e.images.length, 2);
  assert.ok(e.image.includes("a.jpg"));
  assert.ok(e.images[1].includes("b.jpg"));
});

test("buildPullEntry: falls back to single imagePath when imagePaths absent", () => {
  const e = buildPullEntry({ id: "y", imagePath: "images/only.jpg", imagePrivate: false }, "/board", () => null);
  assert.equal(e.images.length, 1);
  assert.ok(e.image.includes("only.jpg"));
});

test("buildPullEntry: private issue uses the dl callback and filters nulls", () => {
  const calls = [];
  const e = buildPullEntry(
    { id: "z", imagePaths: ["images/p1.jpg", "images/p2.jpg"], imagePrivate: true },
    "/board",
    (p, idx) => { calls.push([p, idx]); return idx === 0 ? "/local/p1.jpg" : null; },
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(e.images, ["/local/p1.jpg"]); // null download filtered out
  assert.equal(e.image, "/local/p1.jpg");
  assert.equal(e.imagePrivate, true);
});

test("buildPullEntry: private image-less issue does not call dl and does not throw", () => {
  const e = buildPullEntry({ id: "w", imagePaths: [], imagePrivate: true }, "/board", () => { throw new Error("dl must not be called"); });
  assert.deepEqual(e.images, []);
  assert.equal(e.image, null);
});

test("buildPullEntry: carries through metadata fields", () => {
  const e = buildPullEntry({
    id: "m", createdAt: "t", route: "/r", description: "d", imagePrivate: false,
    needsReview: true, reviewReason: "blocked", author: "octo", tags: ["a"],
    history: [{ event: "reopened", note: "again" }],
  }, "/board", () => null);
  assert.equal(e.needsReview, true);
  assert.equal(e.reviewReason, "blocked");
  assert.equal(e.author, "octo");
  assert.deepEqual(e.tags, ["a"]);
  assert.equal(e.reopenNote, "again");
});
