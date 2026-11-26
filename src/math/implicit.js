/**
 * Implicit surfaces F(x, y, z) = 0 (F < 0 inside).
 *
 * Some closed surfaces — a genus-3 surface, say — have no convenient global
 * parametrisation, but are easy to describe as the boundary of a solid. This module
 * turns such a field into the same MeshData the parametric pipeline produces:
 *
 *   1. polygonize(): marching tetrahedra on a regular grid. Each cube is split into the
 *      same six tetrahedra (Kuhn triangulation) so neighbouring cubes agree on shared
 *      faces, and every surface vertex is created once per grid edge. The result is a
 *      watertight closed mesh, so V − E + F is exactly the Euler characteristic.
 *   2. implicitDifferential(): normal, Gaussian and mean curvature straight from the
 *      gradient and Hessian of F (Goldman, "Curvature formulas for implicit curves and
 *      surfaces", CAGD 2005), using central finite differences.
 */

/** Kuhn triangulation of the unit cube: six tetrahedra along the 0 → 7 diagonal. */
const PERMUTATIONS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0]
];
const TETS = PERMUTATIONS.map(([a, b]) => [0, 1 << a, (1 << a) | (1 << b), 7]);

/**
 * @param {(x: number, y: number, z: number) => number} field
 * @param {{ min: [number, number, number], max: [number, number, number] }} bounds
 *   Must enclose the surface completely (F > 0 on the boundary of the box).
 * @param {number} cellSize  Target grid spacing.
 * @returns {{ positions: Float32Array, indices: Uint32Array, boundaryTouched: boolean }}
 */
export function polygonize(field, bounds, cellSize) {
  const [x0, y0, z0] = bounds.min;
  const [x1, y1, z1] = bounds.max;
  const nx = Math.max(1, Math.ceil((x1 - x0) / cellSize));
  const ny = Math.max(1, Math.ceil((y1 - y0) / cellSize));
  const nz = Math.max(1, Math.ceil((z1 - z0) / cellSize));
  const hx = (x1 - x0) / nx;
  const hy = (y1 - y0) / ny;
  const hz = (z1 - z0) / nz;
  const sx = nx + 1;
  const sy = ny + 1;
  const sz = nz + 1;
  const pointIndex = (i, j, k) => i + sx * (j + sy * k);

  const values = new Float64Array(sx * sy * sz);
  let boundaryTouched = false;
  for (let k = 0; k < sz; k++) {
    const z = z0 + k * hz;
    for (let j = 0; j < sy; j++) {
      const y = y0 + j * hy;
      for (let i = 0; i < sx; i++) {
        let f = field(x0 + i * hx, y, z);
        // A value of exactly zero would put a surface vertex on a grid point shared by
        // several edges; nudging it keeps the combinatorics clean.
        if (f === 0) f = 1e-12;
        values[pointIndex(i, j, k)] = f;
        if (f < 0 && (i === 0 || j === 0 || k === 0 || i === nx || j === ny || k === nz)) boundaryTouched = true;
      }
    }
  }

  const positions = [];
  const indices = [];
  /** @type {Map<number, number>} one surface vertex per grid edge */
  const edgeVertex = new Map();
  const total = sx * sy * sz;

  const gridPos = (g) => {
    const i = g % sx;
    const j = Math.floor(g / sx) % sy;
    const k = Math.floor(g / (sx * sy));
    return [x0 + i * hx, y0 + j * hy, z0 + k * hz];
  };

  const vertexOnEdge = (ga, gb) => {
    const key = ga < gb ? ga * total + gb : gb * total + ga;
    const cached = edgeVertex.get(key);
    if (cached !== undefined) return cached;
    const fa = values[ga];
    const fb = values[gb];
    const t = fa / (fa - fb);
    const a = gridPos(ga);
    const b = gridPos(gb);
    const id = positions.length / 3;
    positions.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    edgeVertex.set(key, id);
    return id;
  };

  const corner = new Array(8);
  const tri = (a, b, c, inside, outside) => {
    // Orient so the normal points from the inside corners towards the outside ones.
    const pa = positions.slice(a * 3, a * 3 + 3);
    const pb = positions.slice(b * 3, b * 3 + 3);
    const pc = positions.slice(c * 3, c * 3 + 3);
    const n = cross3(sub3(pb, pa), sub3(pc, pa));
    const out = sub3(mean3(outside.map(gridPos)), mean3(inside.map(gridPos)));
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  };

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let negatives = 0;
        for (let c = 0; c < 8; c++) {
          corner[c] = pointIndex(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1));
          if (values[corner[c]] < 0) negatives++;
        }
        if (negatives === 0 || negatives === 8) continue; // the surface does not pass through this cube
        for (const tet of TETS) {
          const g = tet.map((c) => corner[c]);
          const inside = g.filter((p) => values[p] < 0);
          const outside = g.filter((p) => values[p] >= 0);
          if (inside.length === 0 || inside.length === 4) continue;
          if (inside.length === 1 || inside.length === 3) {
            const [lone, others] = inside.length === 1 ? [inside[0], outside] : [outside[0], inside];
            tri(vertexOnEdge(lone, others[0]), vertexOnEdge(lone, others[1]), vertexOnEdge(lone, others[2]), inside, outside);
          } else {
            const [a, b] = inside;
            const [c, d] = outside;
            const ac = vertexOnEdge(a, c);
            const ad = vertexOnEdge(a, d);
            const bd = vertexOnEdge(b, d);
            const bc = vertexOnEdge(b, c);
            tri(ac, ad, bd, inside, outside);
            tri(ac, bd, bc, inside, outside);
          }
        }
      }
    }
  }

  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), boundaryTouched };
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mean3 = (pts) => {
  const m = [0, 0, 0];
  for (const p of pts) {
    m[0] += p[0];
    m[1] += p[1];
    m[2] += p[2];
  }
  return [m[0] / pts.length, m[1] / pts.length, m[2] / pts.length];
};

/**
 * Normal and curvatures of the level set F = 0 at p, with the outward normal ∇F/|∇F|.
 *   K = (∇F · adj(Hess F) · ∇F) / |∇F|⁴
 *   H = (∇F · Hess F · ∇F − |∇F|² tr Hess F) / (2 |∇F|³)
 * With this convention a sphere has K = 1/R² and H = −1/R.
 *
 * @param {(x: number, y: number, z: number) => number} f
 * @param {[number, number, number]} p
 * @param {number} h  finite-difference step
 */
export function implicitDifferential(f, [x, y, z], h) {
  const f0 = f(x, y, z);
  const fxp = f(x + h, y, z), fxm = f(x - h, y, z);
  const fyp = f(x, y + h, z), fym = f(x, y - h, z);
  const fzp = f(x, y, z + h), fzm = f(x, y, z - h);
  const g = [(fxp - fxm) / (2 * h), (fyp - fym) / (2 * h), (fzp - fzm) / (2 * h)];
  const h2 = h * h;
  const fxx = (fxp - 2 * f0 + fxm) / h2;
  const fyy = (fyp - 2 * f0 + fym) / h2;
  const fzz = (fzp - 2 * f0 + fzm) / h2;
  const fxy = (f(x + h, y + h, z) - f(x + h, y - h, z) - f(x - h, y + h, z) + f(x - h, y - h, z)) / (4 * h2);
  const fxz = (f(x + h, y, z + h) - f(x + h, y, z - h) - f(x - h, y, z + h) + f(x - h, y, z - h)) / (4 * h2);
  const fyz = (f(x, y + h, z + h) - f(x, y + h, z - h) - f(x, y - h, z + h) + f(x, y - h, z - h)) / (4 * h2);

  const gg = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
  const len = Math.sqrt(gg);
  if (!(len > 1e-12)) return { normal: null, K: NaN, H: NaN };

  // adjugate of the (symmetric) Hessian
  const a11 = fyy * fzz - fyz * fyz;
  const a22 = fxx * fzz - fxz * fxz;
  const a33 = fxx * fyy - fxy * fxy;
  const a12 = fxz * fyz - fxy * fzz;
  const a13 = fxy * fyz - fxz * fyy;
  const a23 = fxy * fxz - fxx * fyz;
  const gAg =
    g[0] * g[0] * a11 + g[1] * g[1] * a22 + g[2] * g[2] * a33 +
    2 * (g[0] * g[1] * a12 + g[0] * g[2] * a13 + g[1] * g[2] * a23);
  const gHg =
    g[0] * g[0] * fxx + g[1] * g[1] * fyy + g[2] * g[2] * fzz +
    2 * (g[0] * g[1] * fxy + g[0] * g[2] * fxz + g[1] * g[2] * fyz);
  const trace = fxx + fyy + fzz;

  return {
    normal: [g[0] / len, g[1] / len, g[2] / len],
    K: gAg / (gg * gg),
    H: (gHg - gg * trace) / (2 * gg * len)
  };
}

/** Grid spacing for an implicit surface: fine enough for its thinnest feature, capped in cost. */
export function implicitCellSize(surface, params, resolution) {
  const b = surface.bounds(params);
  const extent = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  if (resolution) return extent / resolution;
  // About five cells across the thinnest feature, but never finer than extent/140
  // (cost) nor coarser than extent/50 (shape).
  return Math.min(extent / 50, Math.max(extent / 140, surface.featureSize(params) / 5));
}

/**
 * @param {import('./surfaces.js').Surface} surface  kind === "implicit"
 * @param {Record<string, number>} params
 * @param {{ resolution?: number }} [options]  resolution = cells along the longest axis
 * @returns {import('./mesh.js').MeshData}
 */
export function buildImplicitMesh(surface, params, options = {}) {
  const field = (x, y, z) => surface.field(x, y, z, params);
  const bounds = surface.bounds(params);
  const cell = implicitCellSize(surface, params, options.resolution);
  const { positions, indices } = polygonize(field, bounds, cell);
  const vertexCount = positions.length / 3;
  const normals = new Float32Array(vertexCount * 3);
  const gaussian = new Float32Array(vertexCount);
  const mean = new Float32Array(vertexCount);
  const h = cell * 0.05;
  let minK = Infinity, maxK = -Infinity, minH = Infinity, maxH = -Infinity;

  for (let v = 0; v < vertexCount; v++) {
    // Marching tetrahedra places vertices by linear interpolation along grid edges, which
    // is only first-order accurate. Two Newton steps along the gradient put them on F = 0
    // and make areas — and hence ∫K dA — much more accurate.
    const p = projectToSurface(field, [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]], h, cell);
    positions[v * 3] = p[0];
    positions[v * 3 + 1] = p[1];
    positions[v * 3 + 2] = p[2];
    const d = implicitDifferential(field, p, h);
    const n = d.normal ?? [0, 0, 1];
    normals[v * 3] = n[0];
    normals[v * 3 + 1] = n[1];
    normals[v * 3 + 2] = n[2];
    gaussian[v] = d.K;
    mean[v] = d.H;
    if (Number.isFinite(d.K)) {
      if (d.K < minK) minK = d.K;
      if (d.K > maxK) maxK = d.K;
    }
    if (Number.isFinite(d.H)) {
      if (d.H < minH) minH = d.H;
      if (d.H > maxH) maxH = d.H;
    }
  }

  return { positions, normals, indices, gaussian, mean, vertexCount, stats: { minK, maxK, minH, maxH } };
}

/**
 * Newton projection onto F = 0: p ← p − F ∇F / |∇F|². Each step is limited to half a grid
 * cell so a vertex can never jump to a different part of the surface.
 */
export function projectToSurface(f, p, h, maxStep) {
  let [x, y, z] = p;
  for (let it = 0; it < 2; it++) {
    const F = f(x, y, z);
    const gx = (f(x + h, y, z) - f(x - h, y, z)) / (2 * h);
    const gy = (f(x, y + h, z) - f(x, y - h, z)) / (2 * h);
    const gz = (f(x, y, z + h) - f(x, y, z - h)) / (2 * h);
    const gg = gx * gx + gy * gy + gz * gz;
    if (!(gg > 1e-18)) break;
    let s = F / gg;
    const stepLen = Math.abs(s) * Math.sqrt(gg);
    if (stepLen > maxStep / 2) s *= maxStep / 2 / stepLen;
    x -= s * gx;
    y -= s * gy;
    z -= s * gz;
  }
  return [x, y, z];
}

/**
 * ∫K dA over a triangle mesh: per-triangle average of the vertex curvatures × area.
 * @param {import('./mesh.js').MeshData} mesh
 */
export function meshCurvatureIntegral(mesh) {
  const { positions: P, indices: I, gaussian: K } = mesh;
  let total = 0;
  let area = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = cross3(u, w);
    const A = 0.5 * Math.hypot(n[0], n[1], n[2]);
    const k = (K[I[t]] + K[I[t + 1]] + K[I[t + 2]]) / 3;
    if (Number.isFinite(k)) total += k * A;
    area += A;
  }
  return { totalK: total, area };
}
