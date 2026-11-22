import { test } from "node:test";
import assert from "node:assert/strict";
import { SURFACES, defaultParams, getSurface, topologyOf } from "../src/math/surfaces.js";
import { buildMesh, totalCurvature } from "../src/math/mesh.js";
import { meshEulerCharacteristic } from "../src/math/topology.js";
import { buildImplicitMesh, implicitDifferential, polygonize } from "../src/math/implicit.js";
import { gaussBonnetTolerance, meshCountSummary } from "../src/ui/format.js";

const variants = (s) => [
  defaultParams(s),
  Object.fromEntries(s.params.map((p) => [p.id, p.min])),
  Object.fromEntries(s.params.map((p) => [p.id, p.max]))
];

for (const s of SURFACES.filter((x) => x.kind !== "implicit")) {
  test(`${s.id}: χ counted on the welded mesh equals the topology metadata`, () => {
    for (const params of variants(s)) {
      const { chi } = meshEulerCharacteristic(buildMesh(s, params, { resolution: 48 }));
      assert.equal(chi, topologyOf(s, params).eulerChar, JSON.stringify(params));
    }
  });
}

test("welding keeps the Klein bottle's self-intersection apart (χ stays 0, not lower)", () => {
  const s = getSurface("klein");
  const m = buildMesh(s, { r: 2 }, { resolution: 64 }); // v = π lies on the grid
  assert.equal(meshEulerCharacteristic(m).chi, 0);
});

test("without welding, a parametric grid always counts as a disc", () => {
  const m = buildMesh(getSurface("torus"), { R: 1.6, r: 0.6 }, { resolution: 16 });
  assert.equal(meshEulerCharacteristic(m, { weld: false }).chi, 1);
});

test("genus-g surfaces: χ = 2 − 2g exactly, ∫K dA / 2π within the documented tolerance", () => {
  const s = getSurface("genus");
  for (let g = 0; g <= 4; g++) {
    for (const r of [0.2, 0.32, 0.45]) {
      const params = { handles: g, r };
      const mesh = buildMesh(s, params);
      const { chi } = meshEulerCharacteristic(mesh, { weld: false });
      assert.equal(chi, 2 - 2 * g, `g=${g} r=${r}`);
      const ratio = totalCurvature(s, params, mesh).totalK / (2 * Math.PI);
      assert.ok(Math.abs(ratio - chi) < gaussBonnetTolerance(chi, true), `g=${g} r=${r}: ${ratio}`);
    }
  }
});

test("genus-g ∫K dA converges to 2πχ as the grid is refined", () => {
  const s = getSurface("genus");
  const params = { handles: 3, r: 0.32 };
  const err = (res) => Math.abs(totalCurvature(s, params, buildImplicitMesh(s, params, { resolution: res })).totalK / (2 * Math.PI) + 4);
  const coarse = err(80);
  const fine = err(200);
  assert.ok(fine < coarse, `refinement helps (${coarse} → ${fine})`);
  assert.ok(fine < 0.02, `fine grid error ${fine}`);
});

test("implicit curvature: a sphere of radius R has K = 1/R² and H = −1/R", () => {
  const R = 1.7;
  const f = (x, y, z) => Math.hypot(x, y, z) - R;
  for (const p of [[R, 0, 0], [0, 0, -R], [R / Math.sqrt(3), R / Math.sqrt(3), R / Math.sqrt(3)]]) {
    const d = implicitDifferential(f, p, 1e-3);
    assert.ok(Math.abs(d.K - 1 / R ** 2) < 1e-4, `K=${d.K}`);
    assert.ok(Math.abs(d.H + 1 / R) < 1e-4, `H=${d.H}`);
  }
});

test("polygonize produces a closed mesh with outward-facing triangles", () => {
  const R = 1;
  const { positions: P, indices: I } = polygonize((x, y, z) => Math.hypot(x, y, z) - R, { min: [-1.5, -1.5, -1.5], max: [1.5, 1.5, 1.5] }, 0.15);
  // Signed volume via the divergence theorem is positive only if normals point outward.
  let vol = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
  }
  assert.ok(Math.abs(vol - (4 / 3) * Math.PI) < 0.15, `volume ${vol}`);
  assert.equal(meshEulerCharacteristic({ positions: P, normals: new Float32Array(P.length), indices: I }, { weld: false }).chi, 2);
});

test("meshCountSummary reports match / mismatch", () => {
  assert.equal(meshCountSummary({ V: 4, E: 6, F: 4, chi: 2 }, 2).matches, true);
  assert.equal(meshCountSummary({ V: 4, E: 6, F: 4, chi: 2 }, 0).matches, false);
  assert.match(meshCountSummary({ V: 4, E: 6, F: 4, chi: 2 }, null).detail, /4 − 6 \+ 4/);
});
