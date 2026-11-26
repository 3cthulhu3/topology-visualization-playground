/**
 * Geodesics and parallel transport on parametric surfaces.
 *
 * Both are solved in the surface's own (u, v) coordinates with Christoffel symbols, so
 * they only use intrinsic information (the metric). That is the point of the demo:
 * holonomy and geodesic focusing are measured *inside* the surface, yet they reveal its
 * curvature.
 *
 *   geodesic:           ü^k + Γᵏᵢⱼ u̇ⁱ u̇ʲ = 0
 *   parallel transport: V̇^k + Γᵏᵢⱼ u̇ⁱ Vʲ = 0
 *
 * Both are integrated with classical RK4. When a path leaves the parameter domain it is
 * continued across glued edges (surface.seams) or stopped at a real boundary.
 */

import { christoffelAt, cross, dot, length, stepSizes } from "./curvature.js";

/** Wraps an angle into (−π, π]. */
export function wrapAngle(a) {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

const unit = (a) => {
  const l = length(a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Orthonormal tangent frame (e1 along X_u) and unit normal at (u, v). */
function frameAt(c) {
  const e1 = unit(c.Xu);
  const proj = dot(c.Xv, e1);
  const e2 = unit([c.Xv[0] - proj * e1[0], c.Xv[1] - proj * e1[1], c.Xv[2] - proj * e1[2]]);
  return { e1, e2, n: unit(cross(c.Xu, c.Xv)) };
}

/** Coordinates (a, b) with a·X_u + b·X_v = w, for a tangent vector w. */
function toCoordinates(c, w) {
  const det = c.E * c.G - c.F * c.F;
  const pu = dot(w, c.Xu);
  const pv = dot(w, c.Xv);
  return [(c.G * pu - c.F * pv) / det, (-c.F * pu + c.E * pv) / det];
}

const toVector = (c, [a, b]) => [
  a * c.Xu[0] + b * c.Xv[0],
  a * c.Xu[1] + b * c.Xv[1],
  a * c.Xu[2] + b * c.Xv[2]
];

/**
 * Brings (u, v, u̇, v̇) back into the parameter domain across glued edges.
 * @returns {number[] | null} the adjusted state, or null at a real boundary
 */
export function applySeams(surface, state) {
  let [u, v, du, dv] = state;
  const [u0, u1] = surface.uRange;
  const [v0, v1] = surface.vRange;
  const su = u1 - u0;
  const sv = v1 - v0;
  const seams = surface.seams ?? {};

  if (u < u0 || u > u1) {
    if (seams.u === "periodic") {
      u = u0 + ((((u - u0) % su) + su) % su);
    } else if (seams.u === "flip") {
      u = u < u0 ? u + su : u - su;
      v = v0 + v1 - v;
      dv = -dv;
    } else {
      return null;
    }
  }
  if (v < v0 || v > v1) {
    if (seams.v === "periodic") v = v0 + ((((v - v0) % sv) + sv) % sv);
    else return null;
  }
  return [u, v, du, dv];
}

/**
 * Traces one geodesic.
 *
 * @param {import('./surfaces.js').Surface} surface  graph or parametric
 * @param {Record<string, number>} params
 * @param {[number, number]} start   (u, v)
 * @param {number} angle             direction in radians, measured from X_u in the tangent plane
 * @param {number} arcLength
 * @param {{ steps?: number }} [options]
 * @returns {{ points: number[][], normals: number[][], stopped: null | 'boundary' | 'singular', travelled: number }}
 */
export function traceGeodesic(surface, params, start, angle, arcLength, options = {}) {
  const steps = options.steps ?? 400;
  const f = (a, b) => surface.evaluate(a, b, params);
  const { hu, hv } = stepSizes(surface.uRange, surface.vRange);
  const chr = (u, v) => christoffelAt(f, u, v, hu, hv);

  const c0 = chr(start[0], start[1]);
  if (c0.singular) return { points: [c0.p], normals: [[0, 0, 1]], stopped: "singular", travelled: 0 };
  const fr = frameAt(c0);
  const dir = [
    Math.cos(angle) * fr.e1[0] + Math.sin(angle) * fr.e2[0],
    Math.cos(angle) * fr.e1[1] + Math.sin(angle) * fr.e2[1],
    Math.cos(angle) * fr.e1[2] + Math.sin(angle) * fr.e2[2]
  ];
  let y = [start[0], start[1], ...toCoordinates(c0, dir)];

  const ds = arcLength / steps;
  const points = [c0.p];
  const normals = [fr.n];
  let singular = false;

  const rhs = ([u, v, du, dv]) => {
    const c = chr(u, v);
    if (c.singular) {
      singular = true;
      return [0, 0, 0, 0];
    }
    const accel = (g) => -(g[0] * du * du + 2 * g[1] * du * dv + g[2] * dv * dv);
    return [du, dv, accel(c.Gu), accel(c.Gv)];
  };

  for (let i = 0; i < steps; i++) {
    const next = rk4(rhs, y, ds);
    if (singular) return { points, normals, stopped: "singular", travelled: i * ds };
    const wrapped = applySeams(surface, next);
    if (!wrapped) return { points, normals, stopped: "boundary", travelled: i * ds };
    y = wrapped;
    const c = chr(y[0], y[1]);
    if (c.singular) return { points, normals, stopped: "singular", travelled: (i + 1) * ds };
    points.push(c.p);
    normals.push(frameAt(c).n);
  }
  return { points, normals, stopped: null, travelled: arcLength };
}

/**
 * A fan of geodesics leaving one point, symmetric around `direction`.
 * Nearby geodesics converge where K > 0 and diverge where K < 0 (Jacobi equation).
 */
export function geodesicFan(surface, params, { start, direction, spread, count, length: arcLength }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    out.push(traceGeodesic(surface, params, start, direction + t * spread, arcLength));
  }
  return out;
}

/**
 * Parallel-transports a unit vector once around the coordinate loop v = vLoop
 * (u from u0 to u1). Needs a surface whose u-direction is periodic.
 *
 * @returns {{
 *   available: boolean, holonomy: number, points: number[][], normals: number[][],
 *   arrows: { base: number[], vec: number[], normal: number[] }[], start: number[], startVec: number[], endVec: number[]
 * }}
 *   holonomy: signed rotation (radians, in (−π, π]) of the transported vector after one
 *   lap, measured counter-clockwise about the normal X_u × X_v. The sign is that of the
 *   loop traversed as the positively oriented boundary of the region {v < vLoop} (i.e.
 *   towards decreasing u), which makes "holonomy = enclosed curvature" hold with a
 *   plus sign (Gauss–Bonnet / Stokes).
 */
export function parallelTransportLoop(surface, params, vLoop, options = {}) {
  if (surface.seams?.u !== "periodic") return { available: false };
  const steps = options.steps ?? 720;
  const arrowCount = options.arrows ?? 24;
  const f = (a, b) => surface.evaluate(a, b, params);
  const { hu, hv } = stepSizes(surface.uRange, surface.vRange);
  const [u0, u1] = surface.uRange;
  const dt = (u1 - u0) / steps;

  const c0 = christoffelAt(f, u0, vLoop, hu, hv);
  if (c0.singular) return { available: false };
  const fr0 = frameAt(c0);
  let V = toCoordinates(c0, fr0.e1);

  // Along u ↦ (u, vLoop) the velocity is (1, 0), so V̇ᵏ = −(Γᵏᵤᵤ Vᵘ + Γᵏᵤᵥ Vᵛ).
  const rhs = (t, [a, b]) => {
    const c = christoffelAt(f, u0 + t, vLoop, hu, hv);
    return [-(c.Gu[0] * a + c.Gu[1] * b), -(c.Gv[0] * a + c.Gv[1] * b)];
  };

  const points = [];
  const normals = [];
  const arrows = [];
  const every = Math.max(1, Math.floor(steps / arrowCount));
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    const c = christoffelAt(f, u0 + t, vLoop, hu, hv);
    const n = frameAt(c).n;
    points.push(c.p);
    normals.push(n);
    if (i % every === 0 && i < steps) arrows.push({ base: c.p, vec: unit(toVector(c, V)), normal: n });
    if (i < steps) V = rk4t(rhs, t, V, dt);
  }

  const end = unit(toVector(c0, V));
  // We integrated towards increasing u; reversing the lap reverses the rotation.
  const holonomy = -Math.atan2(dot(end, fr0.e2), dot(end, fr0.e1));
  return { available: true, holonomy, points, normals, arrows, start: c0.p, startVec: fr0.e1, endVec: end, startNormal: fr0.n };
}

/**
 * Compares the holonomy of the loop v = vLoop with the curvature enclosed since a
 * reference loop near v = v0 (for the sphere: a tiny circle around the pole, whose
 * holonomy is ≈ 0; for the torus: the outer equator).
 *
 *   holonomy(vLoop) − holonomy(vRef) ≡ ∫∫_{vRef < v < vLoop} K dA   (mod 2π)
 *
 * @returns {{ available: false } | {
 *   available: true, holonomy: number, reference: number, vRef: number,
 *   difference: number, enclosed: number, error: number, transport: ReturnType<typeof parallelTransportLoop>
 * }}
 */
export function holonomyComparison(surface, params, vLoop) {
  const transport = parallelTransportLoop(surface, params, vLoop);
  if (!transport.available) return { available: false };
  const [v0, v1] = surface.vRange;
  const vRef = v0 + 0.005 * (v1 - v0);
  const ref = parallelTransportLoop(surface, params, vRef);
  if (!ref.available) return { available: false };
  const difference = wrapAngle(transport.holonomy - ref.holonomy);
  const enclosed = curvatureBetween(surface, params, vRef, vLoop);
  return {
    available: true,
    holonomy: transport.holonomy,
    reference: ref.holonomy,
    vRef,
    difference,
    enclosed,
    error: Math.abs(wrapAngle(difference - enclosed)),
    transport
  };
}

/**
 * ∫∫ K dA over the band of parameter space between v = vA and v = vB (all u),
 * signed: negative when vB < vA. Midpoint rule.
 */
export function curvatureBetween(surface, params, vA, vB, cells = 160) {
  const f = (a, b) => surface.evaluate(a, b, params);
  const { hu, hv } = stepSizes(surface.uRange, surface.vRange);
  const [u0, u1] = surface.uRange;
  const du = (u1 - u0) / cells;
  const dv = (vB - vA) / cells;
  let total = 0;
  for (let i = 0; i < cells; i++) {
    const u = u0 + (i + 0.5) * du;
    for (let j = 0; j < cells; j++) {
      const v = vA + (j + 0.5) * dv;
      const c = christoffelAt(f, u, v, hu, hv);
      if (c.singular) continue;
      const n = cross(c.Xu, c.Xv);
      const nl = length(n);
      const N = [n[0] / nl, n[1] / nl, n[2] / nl];
      const L = dot(c.Xuu, N);
      const M = dot(c.Xuv, N);
      const Nn = dot(c.Xvv, N);
      const K = (L * Nn - M * M) / (c.E * c.G - c.F * c.F);
      total += K * nl * du * dv;
    }
  }
  return total;
}

function rk4(rhs, y, h) {
  const k1 = rhs(y);
  const k2 = rhs(y.map((x, i) => x + (h / 2) * k1[i]));
  const k3 = rhs(y.map((x, i) => x + (h / 2) * k2[i]));
  const k4 = rhs(y.map((x, i) => x + h * k3[i]));
  return y.map((x, i) => x + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

function rk4t(rhs, t, y, h) {
  const k1 = rhs(t, y);
  const k2 = rhs(t + h / 2, y.map((x, i) => x + (h / 2) * k1[i]));
  const k3 = rhs(t + h / 2, y.map((x, i) => x + (h / 2) * k2[i]));
  const k4 = rhs(t + h, y.map((x, i) => x + h * k3[i]));
  return y.map((x, i) => x + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/**
 * Turns polylines into line-segment pairs, drawn slightly above and below the surface
 * (±offset along the normal) so they stay visible from both sides.
 * @param {{ points: number[][], normals: number[][] }[]} polylines
 * @param {number} offset
 * @returns {Float32Array}
 */
export function polylinesToSegments(polylines, offset) {
  const out = [];
  for (const { points, normals } of polylines) {
    for (const side of [1, -1]) {
      for (let i = 0; i + 1 < points.length; i++) {
        for (const k of [i, i + 1]) {
          out.push(
            points[k][0] + side * offset * normals[k][0],
            points[k][1] + side * offset * normals[k][1],
            points[k][2] + side * offset * normals[k][2]
          );
        }
      }
    }
  }
  return Float32Array.from(out);
}

/** Short segments for tangent vectors (arrows without heads), on both sides of the surface. */
export function arrowsToSegments(arrows, size, offset) {
  const out = [];
  for (const { base, vec, normal } of arrows) {
    for (const side of [1, -1]) {
      const b = [base[0] + side * offset * normal[0], base[1] + side * offset * normal[1], base[2] + side * offset * normal[2]];
      out.push(...b, b[0] + size * vec[0], b[1] + size * vec[1], b[2] + size * vec[2]);
    }
  }
  return Float32Array.from(out);
}
