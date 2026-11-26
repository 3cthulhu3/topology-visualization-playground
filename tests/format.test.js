import { test } from "node:test";
import assert from "node:assert/strict";
import { formatNumber, gaussBonnetSummary, stepDecimals, topologyFacts } from "../src/ui/format.js";
import { getSurface } from "../src/math/surfaces.js";

test("stepDecimals / formatNumber", () => {
  assert.equal(stepDecimals(0.01), 2);
  assert.equal(stepDecimals(1), 0);
  assert.equal(formatNumber(NaN), "–");
  assert.equal(formatNumber(Infinity), "–");
  assert.equal(formatNumber(-1e-9), "0");
  assert.equal(formatNumber(2.00049), "2.000");
});

test("closed surfaces: Gauss–Bonnet summary flags match / mismatch", () => {
  const sphere = getSurface("sphere").topology;
  assert.equal(gaussBonnetSummary(sphere, 4 * Math.PI).matches, true);
  assert.equal(gaussBonnetSummary(sphere, 4 * Math.PI).value, "2.000");
  assert.equal(gaussBonnetSummary(sphere, 3 * Math.PI).matches, false);
});

test("surfaces with boundary are explained, not judged", () => {
  const s = gaussBonnetSummary(getSurface("mobius").topology, 1.23);
  assert.equal(s.matches, null);
  assert.match(s.note, /boundary/);
  assert.equal(gaussBonnetSummary(getSurface("wave").topology, NaN).matches, null);
});

test("topology facts label non-orientable genus correctly", () => {
  assert.equal(topologyFacts(getSurface("torus").topology).genusLabel, "Genus");
  assert.match(topologyFacts(getSurface("klein").topology).genusLabel, /crosscap/);
});

import { fanReadout, transportReadout } from "../src/ui/format.js";

test("fanReadout explains focusing by the sign of K and reports early stops", () => {
  assert.match(fanReadout({ K: 0.4, count: 7, stopped: { boundary: 0, singular: 0 } }), /refocus/);
  assert.match(fanReadout({ K: -2, count: 7, stopped: { boundary: 0, singular: 0 } }), /spread apart/);
  assert.match(fanReadout({ K: 0, count: 7, stopped: { boundary: 0, singular: 0 } }), /parallel/);
  const r = fanReadout({ K: 1, count: 7, stopped: { boundary: 2, singular: 1 } });
  assert.match(r, /2 of 7 reached the edge/);
  assert.match(r, /1 of 7 stopped at a coordinate singularity/);
});

test("transportReadout states availability and the Gauss–Bonnet match", () => {
  assert.equal(transportReadout({ available: false }).matches, null);
  const ok = transportReadout({ available: true, holonomy: 1, reference: 0, difference: 1, enclosed: 1 + 2 * Math.PI, error: 1e-5 });
  assert.equal(ok.matches, true);
  assert.match(ok.text, /57\.3°/);
  assert.equal(transportReadout({ available: true, holonomy: 1, reference: 0, difference: 1, enclosed: 2, error: 1 }).matches, false);
});
