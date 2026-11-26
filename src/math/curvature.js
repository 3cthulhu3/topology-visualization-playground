/**
 * Numerical differential geometry for parametric surfaces X(u, v) → R³.
 *
 * Derivatives are taken with central finite differences, so any surface in the
 * registry gets curvature "for free" without hand-derived formulas. Accuracy is
 * O(h²) and is checked against closed-form results in tests/curvature.test.js.
 */

/** @typedef {[number, number, number]} Vec3 */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
export const length = (a) => Math.sqrt(dot(a, a));

/** Below this value of EG − F² the parametrisation is treated as degenerate (e.g. sphere poles). */
const DEGENERATE_EPS = 1e-12;

/**
 * Step sizes for finite differences, relative to the parameter range.
 * 1e-4 balances truncation error (∝ h²) against round-off (∝ ε/h²).
 */
export function stepSizes(uRange, vRange) {
  return {
    hu: (uRange[1] - uRange[0]) * 1e-4,
    hv: (vRange[1] - vRange[0]) * 1e-4
  };
}

/**
 * Differential-geometric quantities at a single (u, v).
 *
 * @param {(u: number, v: number) => Vec3} f   Surface with parameters already bound.
 * @param {number} u
 * @param {number} v
 * @param {number} hu
 * @param {number} hv
 * @returns {{
 *   point: Vec3, normal: Vec3 | null, K: number, H: number, areaElement: number, degenerate: boolean,
 *   E: number, F: number, G: number, L: number, M: number, N: number
 * }}
 *   E, F, G: first fundamental form (the metric — intrinsic).
 *   L, M, N: second fundamental form (how the surface bends in space — extrinsic).
 *   K: Gaussian curvature, H: mean curvature (sign depends on the normal orientation),
 *   areaElement: |X_u × X_v|. When the parametrisation is degenerate, K and H are NaN.
 */
export function differentialAt(f, u, v, hu, hv) {
  const { p, Xu, Xv, Xuu, Xvv, Xuv } = derivatives(f, u, v, hu, hv);

  const E = dot(Xu, Xu);
  const F = dot(Xu, Xv);
  const G = dot(Xv, Xv);
  const det = E * G - F * F;

  const n = cross(Xu, Xv);
  const nLen = length(n);

  if (!(det > DEGENERATE_EPS) || !(nLen > 0) || !Number.isFinite(det)) {
    return {
      point: p, normal: null, K: NaN, H: NaN, areaElement: 0, degenerate: true,
      E, F, G, L: NaN, M: NaN, N: NaN
    };
  }

  const N = scale(n, 1 / nLen);
  const L = dot(Xuu, N);
  const M = dot(Xuv, N);
  const Nn = dot(Xvv, N);

  return {
    point: p,
    normal: N,
    K: (L * Nn - M * M) / det,
    H: (E * Nn - 2 * F * M + G * L) / (2 * det),
    areaElement: nLen,
    degenerate: false,
    E,
    F,
    G,
    L,
    M,
    N: Nn
  };
}

/**
 * First and second partial derivatives of X(u, v) by central differences.
 * @returns {{ p: Vec3, Xu: Vec3, Xv: Vec3, Xuu: Vec3, Xvv: Vec3, Xuv: Vec3 }}
 */
export function derivatives(f, u, v, hu, hv) {
  const p = f(u, v);
  const pu1 = f(u + hu, v);
  const pu0 = f(u - hu, v);
  const pv1 = f(u, v + hv);
  const pv0 = f(u, v - hv);
  return {
    p,
    Xu: scale(sub(pu1, pu0), 1 / (2 * hu)),
    Xv: scale(sub(pv1, pv0), 1 / (2 * hv)),
    Xuu: scale(add(sub(pu1, scale(p, 2)), pu0), 1 / (hu * hu)),
    Xvv: scale(add(sub(pv1, scale(p, 2)), pv0), 1 / (hv * hv)),
    Xuv: scale(
      sub(sub(f(u + hu, v + hv), f(u + hu, v - hv)), sub(f(u - hu, v + hv), f(u - hu, v - hv))),
      1 / (4 * hu * hv)
    )
  };
}

/**
 * Christoffel symbols of the second kind, Γᵏᵢⱼ = gᵏˡ ⟨Xᵢⱼ, Xₗ⟩, for i, j ∈ {u, v}.
 * Returned as Gu = [Γᵘᵤᵤ, Γᵘᵤᵥ, Γᵘᵥᵥ] and Gv = [Γᵛᵤᵤ, Γᵛᵤᵥ, Γᵛᵥᵥ], together with the frame.
 * `singular` is set where the metric degenerates (e.g. a sphere's poles).
 */
export function christoffelAt(f, u, v, hu, hv) {
  const d = derivatives(f, u, v, hu, hv);
  const E = dot(d.Xu, d.Xu);
  const F = dot(d.Xu, d.Xv);
  const G = dot(d.Xv, d.Xv);
  const det = E * G - F * F;
  const scaleSq = Math.max(E, G) ** 2;
  if (!(det > 1e-6 * scaleSq) || !Number.isFinite(det)) {
    return { ...d, E, F, G, singular: true, Gu: [NaN, NaN, NaN], Gv: [NaN, NaN, NaN] };
  }
  const second = [d.Xuu, d.Xuv, d.Xvv];
  const Gu = second.map((X) => (G * dot(X, d.Xu) - F * dot(X, d.Xv)) / det);
  const Gv = second.map((X) => (-F * dot(X, d.Xu) + E * dot(X, d.Xv)) / det);
  return { ...d, E, F, G, singular: false, Gu, Gv };
}

/**
 * Like differentialAt, but if the point is degenerate (e.g. a sphere pole) it
 * re-samples slightly inside the domain so the result is usable for shading.
 */
export function differentialAtRobust(f, u, v, hu, hv, uRange, vRange) {
  const d = differentialAt(f, u, v, hu, hv);
  if (!d.degenerate) return d;

  const nudgeU = (uRange[1] - uRange[0]) * 1e-3;
  const nudgeV = (vRange[1] - vRange[0]) * 1e-3;
  const vMid = (vRange[0] + vRange[1]) / 2;
  const uMid = (uRange[0] + uRange[1]) / 2;
  const candidates = [
    [u, v + Math.sign(vMid - v || 1) * nudgeV],
    [u + Math.sign(uMid - u || 1) * nudgeU, v]
  ];
  for (const [uu, vv] of candidates) {
    const alt = differentialAt(f, uu, vv, hu, hv);
    if (!alt.degenerate) return { ...alt, point: d.point };
  }
  return d;
}

/**
 * All local invariants of a surface at one parameter point (for the probe panel).
 * @param {import('./surfaces.js').Surface} surface
 * @param {Record<string, number>} params
 * @param {[number, number]} uv
 */
export function localInvariants(surface, params, [u, v]) {
  const { hu, hv } = stepSizes(surface.uRange, surface.vRange);
  return differentialAt((a, b) => surface.evaluate(a, b, params), u, v, hu, hv);
}

/**
 * Numerically integrates Gaussian curvature over the whole parameter domain
 * using the midpoint rule: ∫∫ K |X_u × X_v| du dv.
 *
 * For a closed surface, Gauss–Bonnet says the result equals 2πχ — a purely
 * topological number that no amount of stretching can change.
 *
 * @param {import('./surfaces.js').Surface} surface
 * @param {Record<string, number>} params
 * @param {number} [n=160]  Cells per parameter direction.
 * @returns {{ totalK: number, area: number }}
 */
export function integrateCurvature(surface, params, n = 160) {
  const f = (u, v) => surface.evaluate(u, v, params);
  const [u0, u1] = surface.uRange;
  const [v0, v1] = surface.vRange;
  const du = (u1 - u0) / n;
  const dv = (v1 - v0) / n;
  const { hu, hv } = stepSizes(surface.uRange, surface.vRange);

  let totalK = 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const u = u0 + (i + 0.5) * du;
    for (let j = 0; j < n; j++) {
      const v = v0 + (j + 0.5) * dv;
      const d = differentialAt(f, u, v, hu, hv);
      if (d.degenerate) continue; // measure-zero set; contributes nothing
      const dA = d.areaElement * du * dv;
      totalK += d.K * dA;
      area += dA;
    }
  }
  return { totalK, area };
}
