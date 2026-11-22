import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultState, hashToState, normalizeState, stateToHash, clampParam } from "../src/state.js";
import { SURFACES, defaultParams } from "../src/math/surfaces.js";

test("default state reproduces the original demo (wave, a = 0.75, f = 3)", () => {
  const s = defaultState();
  assert.equal(s.surfaceId, "wave");
  assert.deepEqual(s.params, { amplitude: 0.75, frequency: 3 });
  assert.equal(s.wireframe, false);
});

test("state ↔ hash round-trips for every surface", () => {
  for (const surf of SURFACES) {
    const state = normalizeState({ surfaceId: surf.id, params: defaultParams(surf), colorMode: "mean", wireframe: true });
    assert.deepEqual(hashToState(stateToHash(state)), state);
    assert.deepEqual(hashToState("#" + stateToHash(state)), state);
  }
});

test("garbage hashes fall back to defaults instead of throwing", () => {
  for (const h of ["", "#", "#%%%", "#surface=nope", "#surface=torus&R=banana", null, undefined]) {
    const s = hashToState(h);
    assert.ok(s.surfaceId);
    assert.ok(Object.values(s.params).every(Number.isFinite), `hash ${h}`);
  }
  assert.equal(hashToState("#surface=nope").surfaceId, "wave");
  assert.equal(hashToState("#surface=torus&R=banana").params.R, 1.6);
});

test("out-of-range values are clamped and rounded to the step", () => {
  const s = hashToState("#surface=torus&R=99&r=-5&color=rainbow");
  assert.equal(s.params.R, 2.5);
  assert.equal(s.params.r, 0.1);
  assert.equal(s.colorMode, "gaussian");
  assert.equal(clampParam({ min: 0, max: 2, step: 0.01, default: 1 }, 0.123456), 0.12);
  assert.equal(clampParam({ min: 1, max: 10, step: 1, default: 3 }, 4.6), 5);
});

test("tool state: defaults, round-trip, validation", () => {
  assert.equal(defaultState().tool, "none");
  const fan = normalizeState({ surfaceId: "sphere", tool: "fan", toolParams: { g_u: 0.4, g_dir: 90 } });
  assert.deepEqual(hashToState(stateToHash(fan)), fan);
  assert.match(stateToHash(fan), /tool=fan/);
  assert.doesNotMatch(stateToHash(fan), /loop_v/, "only the active tool's parameters go into the URL");
  assert.doesNotMatch(stateToHash(defaultState()), /tool=/, "no tool, no clutter");
  const bad = hashToState("#surface=torus&tool=laser&g_len=999&loop_v=-3");
  assert.equal(bad.tool, "none");
  assert.equal(bad.toolParams.g_len, 15);
  assert.equal(bad.toolParams.loop_v, 0.02);
});
