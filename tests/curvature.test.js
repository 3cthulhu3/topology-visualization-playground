import { test } from "node:test";
import assert from "node:assert/strict";
import { differentialAt, integrateCurvature, stepSizes } from "../src/math/curvature.js";
import { getSurface } from "../src/math/surfaces.js";

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ""} expected ${expected} ± ${tol}, got ${actual}`);

function at(surfaceId, params, u, v) {
  const s = getSurface(surfaceId);
  const { hu, hv } = stepSizes(s.uRange, s.vRange);
  return differentialAt((a, b) => s.evaluate(a, b, params), u, v, hu, hv);
}

test("sphere: K = 1/R² and |H| = 1/R everywhere away from the poles", () => {
  for (const R of [0.5, 1, 2.3]) {
    for (const [u, v] of [[0.3, 0.7], [2, 1.5], [5, 2.8]]) {
      const d = at("sphere", { R }, u, v);
      near(d.K, 1 / (R * R), 1e-4, `R=${R}`);
      near(Math.abs(d.H), 1 / R, 1e-4, `R=${R}`);
    }
  }
});

test("sphere poles are reported as degenerate instead of returning garbage", () => {
  const d = at("sphere", { R: 1 }, 0, 0);
  assert.equal(d.degenerate, true);
  assert.ok(Number.isNaN(d.K));
});

test("torus: K = cos v / (r (R + r cos v))", () => {
  const R = 1.6, r = 0.6;
  for (const v of [0, Math.PI / 2, Math.PI, 4]) {
    const d = at("torus", { R, r }, 1.1, v);
    near(d.K, Math.cos(v) / (r * (R + r * Math.cos(v))), 1e-4, `v=${v}`);
  }
  assert.ok(at("torus", { R, r }, 0, 0).K > 0, "outer equator is elliptic");
  assert.ok(at("torus", { R, r }, 0, Math.PI).K < 0, "inner equator is hyperbolic");
});

test("graphs: K matches (z_xx z_yy − z_xy²)/(1 + z_x² + z_y²)²", () => {
  // Saddle z = a(x² − y²): z_x = 2ax, z_y = −2ay, z_xx = 2a, z_yy = −2a, z_xy = 0
  const a = 0.4;
  for (const [x, y] of [[0, 0], [0.5, -0.3], [1.2, 1.1]]) {
    const expected = (-4 * a * a) / (1 + 4 * a * a * x * x + 4 * a * a * y * y) ** 2;
    near(at("saddle", { a }, x, y).K, expected, 1e-4, `(${x},${y})`);
  }
  // Wave with amplitude 0 is a flat plane.
  const flat = at("wave", { amplitude: 0, frequency: 3 }, 0.3, -0.8);
  near(flat.K, 0, 1e-8);
  near(flat.H, 0, 1e-8);
});

test("Gauss–Bonnet: ∫K dA = 2πχ for closed surfaces, independent of shape parameters", () => {
  const cases = [
    ["sphere", { R: 0.7 }],
    ["sphere", { R: 2.2 }],
    ["torus", { R: 1.6, r: 0.6 }],
    ["torus", { R: 2.4, r: 0.2 }],
    ["klein", { r: 2 }],
    ["klein", { r: 2.8 }]
  ];
  for (const [id, params] of cases) {
    const s = getSurface(id);
    const { totalK } = integrateCurvature(s, params, 200);
    const chi = totalK / (2 * Math.PI);
    near(chi, s.topology.eulerChar, 0.01, `${id} ${JSON.stringify(params)}`);
  }
});

test("sphere area is 4πR²", () => {
  const { area } = integrateCurvature(getSurface("sphere"), { R: 1.5 }, 200);
  near(area, 4 * Math.PI * 1.5 * 1.5, 1e-3 * area);
});
