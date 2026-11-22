import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMesh } from "../src/math/mesh.js";
import { SURFACES, defaultParams, getSurface } from "../src/math/surfaces.js";

for (const s of SURFACES) {
  test(`${s.id}: mesh buffers are consistent and finite`, () => {
    const res = 24;
    const m = buildMesh(s, defaultParams(s), { resolution: res });
    const verts = (res + 1) ** 2;
    assert.equal(m.vertexCount, verts);
    assert.equal(m.positions.length, verts * 3);
    assert.equal(m.normals.length, verts * 3);
    assert.equal(m.indices.length, res * res * 6);
    assert.ok(m.positions.every(Number.isFinite), "positions finite");
    assert.ok(Math.max(...m.indices) < verts, "indices in range");
    for (let i = 0; i < verts; i++) {
      const n = Math.hypot(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]);
      assert.ok(Math.abs(n - 1) < 1e-5, `unit normal at ${i}`);
    }
  });
}

test("sphere mesh: poles get usable curvature via the robust fallback", () => {
  const m = buildMesh(getSurface("sphere"), { R: 1 }, { resolution: 16 });
  // Every vertex, including the poles, should have K ≈ 1.
  for (const K of m.gaussian) assert.ok(Math.abs(K - 1) < 1e-3, `K=${K}`);
});

test("resolution is clamped to a sane minimum", () => {
  const m = buildMesh(getSurface("wave"), { amplitude: 0.5, frequency: 2 }, { resolution: 0 });
  assert.equal(m.vertexCount, 9);
});
