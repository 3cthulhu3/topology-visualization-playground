import { test } from "node:test";
import assert from "node:assert/strict";
import { localInvariants } from "../src/math/curvature.js";
import { getSurface, topologyOf } from "../src/math/surfaces.js";
import { invariantRows } from "../src/ui/format.js";

const bonnet = getSurface("bonnet");
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b} ± ${tol}, got ${a}`);

test("Bonnet family: metric, K and H are the same for every t (mean-curvature-preserving isometry)", () => {
  for (const [u, v] of [[0.4, -0.9], [2.0, 0.1], [5.1, 1.0]]) {
    const ch2 = Math.cosh(v) ** 2;
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const d = localInvariants(bonnet, { t }, [u, v]);
      near(d.E, ch2, 1e-5, `E t=${t}`);
      near(d.F, 0, 1e-5, `F t=${t}`);
      near(d.G, ch2, 1e-5, `G t=${t}`);
      near(d.H, 0, 1e-5, `H t=${t}`);
      near(d.K, -1 / ch2 ** 2, 1e-4, `K t=${t}`);
    }
  }
});

test("Bonnet family: the second fundamental form rotates, so members are not congruent", () => {
  // For this family (L, M, N) = (−cos θ, sin θ, cos θ) / 1 at every point, θ = t·π/2,
  // up to the orientation sign of the normal. A rigid motion would leave it unchanged.
  const uv = [1.3, 0.4];
  for (const t of [0, 0.3, 0.7, 1]) {
    const theta = (t * Math.PI) / 2;
    const d = localInvariants(bonnet, { t }, uv);
    const sign = Math.sign(d.N || d.M) || 1;
    near(Math.abs(d.L), Math.cos(theta), 1e-4, `|L| t=${t}`);
    near(Math.abs(d.M), Math.sin(theta), 1e-4, `|M| t=${t}`);
    near(d.L, -d.N, 1e-4, `L = −N t=${t}`);
    assert.ok(sign !== 0);
  }
  const a = localInvariants(bonnet, { t: 0 }, uv);
  const b = localInvariants(bonnet, { t: 1 }, uv);
  assert.ok(Math.abs(Math.abs(a.L) - Math.abs(b.L)) > 0.9, "catenoid and helicoid differ extrinsically");
});

test("Bonnet family topology: annulus at t = 0, disc otherwise", () => {
  assert.equal(topologyOf(bonnet, { t: 0 }).eulerChar, 0);
  assert.equal(topologyOf(bonnet, { t: 0.01 }).eulerChar, 1);
});

test("invariantRows groups intrinsic before extrinsic quantities", () => {
  const rows = invariantRows({ E: 1, F: 0, G: 1, K: 0, H: 0, L: 1, M: 0, N: -1 });
  assert.deepEqual(rows.map((r) => r.group), [...Array(4).fill("intrinsic"), ...Array(4).fill("extrinsic")]);
  assert.deepEqual(rows.filter((r) => r.groupStart).map((r) => r.label[0]), ["E", "H"]);
  assert.equal(invariantRows({ E: NaN, F: 0, G: 0, K: 0, H: 0, L: 0, M: 0, N: 0 })[0].value, "–");
});
