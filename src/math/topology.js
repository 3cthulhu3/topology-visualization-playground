/**
 * Combinatorial topology of a triangle mesh: χ = V − E + F.
 *
 * Parametric meshes are built on a (u, v) grid, so seams (torus, Möbius strip, Klein
 * bottle) and poles (sphere) appear as duplicated vertices. Before counting we "weld"
 * vertices that sit at the same point in space AND share the same tangent plane.
 *
 * The tangent-plane test matters for immersions: the figure-8 Klein bottle passes
 * through itself, so different sheets meet at the same point. Those points must stay
 * separate, and they can be told apart because the sheets cross at an angle. Normals
 * are compared up to sign, so the orientation flip across a Möbius or Klein seam still
 * welds.
 */

/** |n₁·n₂| above this counts as "same tangent plane". */
const SAME_PLANE = 0.9;

/**
 * @param {{ positions: Float32Array, normals: Float32Array, indices: Uint32Array }} mesh
 * @param {{ weld?: boolean }} [options]  Set weld: false for meshes that already share
 *   vertices (e.g. implicit surfaces), where welding by position could only do harm.
 * @returns {{ V: number, E: number, F: number, chi: number }}
 */
export function meshEulerCharacteristic(mesh, options = {}) {
  const { positions, normals, indices } = mesh;
  const vertexCount = positions.length / 3;
  const remap = options.weld === false ? identity(vertexCount) : weldVertices(positions, normals);

  const edges = new Set();
  const used = new Set();
  let F = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]];
    const b = remap[indices[t + 1]];
    const c = remap[indices[t + 2]];
    if (a === b || b === c || a === c) continue; // collapsed by welding (e.g. at a pole)
    F++;
    used.add(a).add(b).add(c);
    edges.add(edgeKey(a, b)).add(edgeKey(b, c)).add(edgeKey(a, c));
  }
  const V = used.size;
  const E = edges.size;
  return { V, E, F, chi: V - E + F };
}

function identity(n) {
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

/** Order-independent key for an undirected edge (vertex ids are < 2²⁶ in practice). */
function edgeKey(a, b) {
  return a < b ? a * 67108864 + b : b * 67108864 + a;
}

/**
 * Maps every vertex to a representative. Uses a spatial hash with a tolerance that
 * scales with the mesh size, and checks the 27 neighbouring cells so that two nearly
 * equal positions on either side of a cell boundary still meet.
 */
export function weldVertices(positions, normals) {
  const n = positions.length / 3;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < positions.length; i++) {
    if (positions[i] < min) min = positions[i];
    if (positions[i] > max) max = positions[i];
  }
  const eps = Math.max(max - min, 1e-9) * 1e-5;
  const cell = (x) => Math.floor(x / eps);
  const key = (i, j, k) => `${i},${j},${k}`;
  /** @type {Map<string, number[]>} */
  const buckets = new Map();
  const remap = new Uint32Array(n);

  for (let v = 0; v < n; v++) {
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    const ci = cell(x);
    const cj = cell(y);
    const ck = cell(z);
    let found = -1;
    search: for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (let dk = -1; dk <= 1; dk++) {
          const list = buckets.get(key(ci + di, cj + dj, ck + dk));
          if (!list) continue;
          for (const r of list) {
            const dx = positions[r * 3] - x;
            const dy = positions[r * 3 + 1] - y;
            const dz = positions[r * 3 + 2] - z;
            if (dx * dx + dy * dy + dz * dz > eps * eps) continue;
            const dot =
              normals[r * 3] * normals[v * 3] +
              normals[r * 3 + 1] * normals[v * 3 + 1] +
              normals[r * 3 + 2] * normals[v * 3 + 2];
            if (Math.abs(dot) >= SAME_PLANE) {
              found = r;
              break search;
            }
          }
        }
      }
    }
    if (found >= 0) {
      remap[v] = found;
    } else {
      remap[v] = v;
      const k = key(ci, cj, ck);
      const list = buckets.get(k);
      if (list) list.push(v);
      else buckets.set(k, [v]);
    }
  }
  return remap;
}
