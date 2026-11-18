import { test } from "node:test";
import assert from "node:assert/strict";
import { divergingColor, robustLimit, colorize, NEUTRAL, NEGATIVE, POSITIVE, UNDEFINED } from "../src/math/colormap.js";

const approx = (a, b) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-9, `${a} vs ${b}`));

test("zero maps to neutral, ±limit to the saturated ends", () => {
  assert.deepEqual(divergingColor(0, 1), NEUTRAL);
  approx(divergingColor(1, 1), POSITIVE);
  approx(divergingColor(-1, 1), NEGATIVE);
  approx(divergingColor(50, 1), POSITIVE); // clamped
});

test("NaN and a zero limit do not throw", () => {
  assert.deepEqual(divergingColor(NaN, 1), UNDEFINED);
  assert.deepEqual(divergingColor(0.3, 0), NEUTRAL);
});

test("robustLimit ignores NaN and outliers, treats numeric noise as zero", () => {
  const values = [...Array(99).fill(1), 1000, NaN];
  assert.equal(robustLimit(values), 1);
  assert.equal(robustLimit([1e-10, -2e-9]), 0);
  assert.equal(robustLimit([]), 0);
});

test("colorize packs RGB triples", () => {
  const out = colorize([0, -1, 1], 1);
  assert.equal(out.length, 9);
  assert.ok(Math.abs(out[3] - NEGATIVE[0]) < 1e-6);
});
