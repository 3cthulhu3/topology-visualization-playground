import { test } from "node:test";
import assert from "node:assert/strict";
import { getSurface } from "../src/math/surfaces.js";
import {
  applySeams,
  arrowsToSegments,
  geodesicFan,
  holonomyComparison,
  parallelTransportLoop,
  polylinesToSegments,
  traceGeodesic,
  wrapAngle
} from "../src/math/geodesics.js";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sphere = getSurface("sphere");
const torus = getSurface("torus");

test("wrapAngle maps into (−π, π]", () => {
  assert.equal(wrapAngle(0), 0);
  assert.ok(Math.abs(wrapAngle(3 * Math.PI) - Math.PI) < 1e-12);
  assert.ok(Math.abs(wrapAngle(-Math.PI / 2 - 4 * Math.PI) + Math.PI / 2) < 1e-12);
});

test("sphere: a geodesic is a great circle and closes after 2πR", () => {
  const R = 1.5;
  const g = traceGeodesic(sphere, { R }, [0.5, 1.2], 0.7, 2 * Math.PI * R, { steps: 800 });
  assert.equal(g.stopped, null);
  const [a, b] = [g.points[0], g.points[40]];
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nl = Math.hypot(...n);
  for (const q of g.points) {
    assert.ok(Math.abs(Math.hypot(...q) - R) < 1e-9, "on the sphere");
    assert.ok(Math.abs((n[0] * q[0] + n[1] * q[1] + n[2] * q[2]) / nl) < 1e-5, "in one plane through the centre");
  }
  assert.ok(dist(g.points.at(-1), g.points[0]) < 1e-4, "closes up");
});

test("sphere: a fan of geodesics refocuses at the antipode after πR (positive curvature)", () => {
  const R = 1.5;
  const u = 1;
  const fan = geodesicFan(sphere, { R }, { start: [u, Math.PI / 2], direction: 0, spread: 1, count: 7, length: Math.PI * R });
  const antipode = [-Math.cos(u) * R, -Math.sin(u) * R, 0];
  for (const g of fan) {
    assert.equal(g.stopped, null);
    assert.ok(dist(g.points.at(-1), antipode) < 1e-4);
  }
});

test("flat graph: geodesics are straight lines", () => {
  const wave = getSurface("wave");
  const g = traceGeodesic(wave, { amplitude: 0, frequency: 3 }, [-1, -0.5], 0.6, 2, { steps: 200 });
  const a = g.points[0];
  const b = g.points.at(-1);
  assert.ok(Math.abs(dist(a, b) - 2) < 1e-6, "length preserved");
  for (const q of g.points) {
    const t = dist(a, q) / dist(a, b);
    const onLine = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
    assert.ok(dist(q, onLine) < 1e-6);
  }
});

test("flat graph: geodesics leaving the patch stop at the boundary", () => {
  const g = traceGeodesic(getSurface("wave"), { amplitude: 0, frequency: 3 }, [0, 0], 0, 10);
  assert.equal(g.stopped, "boundary");
  assert.ok(g.travelled > 1.9 && g.travelled < 2.1);
});

test("torus: the outer equator is a geodesic", () => {
  const params = { R: 1.6, r: 0.6 };
  const g = traceGeodesic(torus, params, [0, 0], 0, 2 * Math.PI * 2.2, { steps: 600 });
  for (const q of g.points) {
    assert.ok(Math.abs(q[2]) < 1e-6);
    assert.ok(Math.abs(Math.hypot(q[0], q[1]) - 2.2) < 1e-6);
  }
});

test("Möbius strip: geodesics cross the twisted seam continuously", () => {
  const mobius = getSurface("mobius");
  // Starts just before the seam (u = 6.0 → y < 0) and must end past it (y > 0).
  const g = traceGeodesic(mobius, { radius: 1.6, width: 0.6 }, [6.0, 0], 0, 1.2, { steps: 200 });
  assert.equal(g.stopped, null);
  assert.ok(g.points[0][1] < 0 && g.points.at(-1)[1] > 0, "crossed the seam");
  for (let i = 1; i < g.points.length; i++) assert.ok(dist(g.points[i], g.points[i - 1]) < 0.02, `jump at ${i}`);
});

test("applySeams: periodic wrap, twisted gluing, real boundaries", () => {
  const s = { uRange: [0, 10], vRange: [-1, 1], seams: { u: "periodic" } };
  assert.deepEqual(applySeams(s, [10.5, 0.2, 1, 1]), [0.5, 0.2, 1, 1]);
  assert.equal(applySeams(s, [5, 1.2, 0, 1]), null);
  const twisted = { ...s, seams: { u: "flip" } };
  assert.deepEqual(applySeams(twisted, [10.5, 0.2, 1, 0.3]), [0.5, -0.2, 1, -0.3]);
  assert.equal(applySeams({ ...s, seams: {} }, [-0.1, 0, -1, 0]), null);
});

test("sphere: holonomy around a latitude equals the curvature of the polar cap, 2π(1 − cos v₀)", () => {
  for (const v0 of [0.4, 1.0, 1.4]) {
    const h = parallelTransportLoop(sphere, { R: 1.5 }, v0);
    assert.ok(h.available);
    assert.ok(Math.abs(wrapAngle(h.holonomy - 2 * Math.PI * (1 - Math.cos(v0)))) < 1e-3, `v0=${v0}: ${h.holonomy}`);
  }
});

test("holonomy change between two loops equals the curvature between them (sphere and torus)", () => {
  for (const [surface, params] of [[sphere, { R: 1.5 }], [sphere, { R: 0.7 }], [torus, { R: 1.6, r: 0.6 }], [torus, { R: 2.3, r: 0.3 }]]) {
    for (const frac of [0.2, 0.45, 0.8]) {
      const v = surface.vRange[0] + frac * (surface.vRange[1] - surface.vRange[0]);
      const c = holonomyComparison(surface, params, v);
      assert.ok(c.available);
      assert.ok(c.error < 1e-3, `${surface.id} ${frac}: error ${c.error}`);
    }
  }
});

test("parallel transport needs a periodic u-direction", () => {
  assert.equal(parallelTransportLoop(getSurface("wave"), { amplitude: 0.5, frequency: 2 }, 0).available, false);
  assert.equal(holonomyComparison(getSurface("mobius"), { radius: 1.6, width: 0.6 }, 0).available, false);
});

test("segment helpers emit pairs of points on both sides of the surface", () => {
  const line = { points: [[0, 0, 0], [1, 0, 0], [2, 0, 0]], normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1]] };
  const seg = polylinesToSegments([line], 0.1);
  assert.equal(seg.length, 2 * 2 * 2 * 3); // 2 sides × 2 segments × 2 endpoints × xyz
  assert.ok(Math.abs(seg[2] - 0.1) < 1e-6 && Math.abs(seg[14] + 0.1) < 1e-6);
  const arr = arrowsToSegments([{ base: [0, 0, 0], vec: [1, 0, 0], normal: [0, 0, 1] }], 0.5, 0.01);
  assert.equal(arr.length, 2 * 6);
  assert.ok(Math.abs(arr[3] - 0.5) < 1e-6);
});
