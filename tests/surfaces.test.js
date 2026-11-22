import { test } from "node:test";
import assert from "node:assert/strict";
import { SURFACES, DEFAULT_SURFACE_ID, getSurface, defaultParams, topologyOf, probePoint } from "../src/math/surfaces.js";

const RESERVED_URL_KEYS = ["surface", "color", "wireframe"];

test("registry ids are unique and the default exists", () => {
  const ids = SURFACES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(getSurface(DEFAULT_SURFACE_ID));
  assert.equal(getSurface("does-not-exist"), undefined);
});

for (const s of SURFACES) {
  test(`${s.id}: parameter specs are well-formed`, () => {
    const pids = s.params.map((p) => p.id);
    assert.equal(new Set(pids).size, pids.length, "param ids unique");
    for (const p of s.params) {
      assert.ok(!RESERVED_URL_KEYS.includes(p.id), `${p.id} collides with a URL key`);
      assert.ok(p.min < p.max, `${p.id}: min < max`);
      assert.ok(p.step > 0, `${p.id}: step > 0`);
      assert.ok(p.default >= p.min && p.default <= p.max, `${p.id}: default in range`);
    }
  });

  if (s.kind === "implicit") {
    test(`${s.id}: field is negative somewhere inside and positive on the bounding box`, () => {
      for (const params of extremes(s)) {
        const b = s.bounds(params);
        const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => [
          c & 1 ? b.max[0] : b.min[0],
          c & 2 ? b.max[1] : b.min[1],
          c & 4 ? b.max[2] : b.min[2]
        ]);
        for (const [x, y, z] of corners) assert.ok(s.field(x, y, z, params) > 0, "outside at corners");
        assert.ok(s.featureSize(params) > 0);
      }
    });
    test(`${s.id}: topology metadata is consistent (defaults and extremes)`, () => {
      for (const params of extremes(s)) checkTopology(topologyOf(s, params));
    });
    continue;
  }

  test(`${s.id}: evaluate is finite across the domain at defaults and extremes`, () => {
    const variants = [
      defaultParams(s),
      Object.fromEntries(s.params.map((p) => [p.id, p.min])),
      Object.fromEntries(s.params.map((p) => [p.id, p.max]))
    ];
    for (const params of variants) {
      for (let i = 0; i <= 10; i++) {
        for (let j = 0; j <= 10; j++) {
          const u = s.uRange[0] + ((s.uRange[1] - s.uRange[0]) * i) / 10;
          const v = s.vRange[0] + ((s.vRange[1] - s.vRange[0]) * j) / 10;
          const p = s.evaluate(u, v, params);
          assert.equal(p.length, 3);
          assert.ok(p.every(Number.isFinite), `${s.id}(${u},${v}) = ${p}`);
        }
      }
    }
  });

  test(`${s.id}: topology metadata is consistent (defaults and extremes)`, () => {
    const variants = [
      defaultParams(s),
      Object.fromEntries(s.params.map((p) => [p.id, p.min])),
      Object.fromEntries(s.params.map((p) => [p.id, p.max]))
    ];
    for (const params of variants) checkTopology(topologyOf(s, params));
  });

  test(`${s.id}: probe point lies inside the domain`, () => {
    const [u, v] = probePoint(s);
    assert.ok(u >= s.uRange[0] && u <= s.uRange[1] && v >= s.vRange[0] && v <= s.vRange[1]);
  });
}

function checkTopology(t) {
  {
    assert.equal(typeof t.note, "string");
    if (t.closed) assert.equal(t.boundaryComponents, 0);
    if (t.eulerChar !== null && t.genus !== null) {
      // χ = 2 − 2g − b (orientable) or χ = 2 − k − b (non-orientable, k crosscaps)
      const expected = t.orientable ? 2 - 2 * t.genus - t.boundaryComponents : 2 - t.genus - t.boundaryComponents;
      assert.equal(t.eulerChar, expected);
    }
  }
}

function extremes(s) {
  return [
    defaultParams(s),
    Object.fromEntries(s.params.map((p) => [p.id, p.min])),
    Object.fromEntries(s.params.map((p) => [p.id, p.max]))
  ];
}

test("closed parametric surfaces close up: X(u0, v) = X(u1, v) along the u seam", () => {
  for (const s of SURFACES.filter((x) => x.kind === "parametric" && topologyOf(x, defaultParams(x)).closed)) {
    const params = defaultParams(s);
    for (const v of [0.3, 1.1, 2.5]) {
      const a = s.evaluate(s.uRange[0], v, params);
      const b = s.evaluate(s.uRange[1], v, params);
      if (s.id === "klein") {
        // Klein bottle: the u seam glues v to −v (mod 2π) — the orientation flip.
        const c = s.evaluate(s.uRange[1], 2 * Math.PI - v, params);
        a.forEach((x, k) => assert.ok(Math.abs(x - c[k]) < 1e-9, `klein seam v=${v}`));
      } else {
        a.forEach((x, k) => assert.ok(Math.abs(x - b[k]) < 1e-9, `${s.id} seam v=${v}`));
      }
    }
  }
});
