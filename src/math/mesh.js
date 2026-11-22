/**
 * Turns a surface description into renderer-agnostic triangle-mesh buffers.
 * No THREE.js here: the output is plain typed arrays, so it is fully testable in Node.
 */

import { differentialAtRobust, stepSizes } from "./curvature.js";

export const DEFAULT_RESOLUTION = 128;

/**
 * @typedef {Object} MeshData
 * @property {Float32Array} positions  xyz per vertex (mathematical frame, z up)
 * @property {Float32Array} normals    unit normals per vertex
 * @property {Uint32Array}  indices    triangle list
 * @property {Float32Array} gaussian   Gaussian curvature K per vertex (NaN where undefined)
 * @property {Float32Array} mean       mean curvature H per vertex (NaN where undefined)
 * @property {number} vertexCount
 * @property {{ minK: number, maxK: number, minH: number, maxH: number }} stats
 */

/**
 * @param {import('./surfaces.js').Surface} surface
 * @param {Record<string, number>} params
 * @param {{ resolution?: number }} [options]
 * @returns {MeshData}
 */
export function buildMesh(surface, params, options = {}) {
  const res = Math.max(2, Math.floor(options.resolution ?? DEFAULT_RESOLUTION));
  const nu = res;
  const nv = res;
  const [u0, u1] = surface.uRange;
  const [v0, v1] = surface.vRange;
  const { hu, hv } = stepSizes(surface.uRange, surface.vRange);
  const f = (u, v) => surface.evaluate(u, v, params);

  const vertexCount = (nu + 1) * (nv + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const gaussian = new Float32Array(vertexCount);
  const mean = new Float32Array(vertexCount);

  let minK = Infinity;
  let maxK = -Infinity;
  let minH = Infinity;
  let maxH = -Infinity;

  let k = 0;
  for (let j = 0; j <= nv; j++) {
    const v = v0 + ((v1 - v0) * j) / nv;
    for (let i = 0; i <= nu; i++) {
      const u = u0 + ((u1 - u0) * i) / nu;
      const d = differentialAtRobust(f, u, v, hu, hv, surface.uRange, surface.vRange);

      positions[k * 3] = d.point[0];
      positions[k * 3 + 1] = d.point[1];
      positions[k * 3 + 2] = d.point[2];

      const n = d.normal ?? [0, 0, 1];
      normals[k * 3] = n[0];
      normals[k * 3 + 1] = n[1];
      normals[k * 3 + 2] = n[2];

      gaussian[k] = d.K;
      mean[k] = d.H;
      if (Number.isFinite(d.K)) {
        if (d.K < minK) minK = d.K;
        if (d.K > maxK) maxK = d.K;
      }
      if (Number.isFinite(d.H)) {
        if (d.H < minH) minH = d.H;
        if (d.H > maxH) maxH = d.H;
      }
      k++;
    }
  }

  const indices = new Uint32Array(nu * nv * 6);
  let t = 0;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + (nu + 1);
      const e = c + 1;
      indices[t++] = a;
      indices[t++] = b;
      indices[t++] = e;
      indices[t++] = a;
      indices[t++] = e;
      indices[t++] = c;
    }
  }

  return {
    positions,
    normals,
    indices,
    gaussian,
    mean,
    vertexCount,
    stats: { minK, maxK, minH, maxH }
  };
}
