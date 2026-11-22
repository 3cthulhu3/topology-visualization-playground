/**
 * Surface registry.
 *
 * Every surface is a pure description with no rendering dependencies, so it can be
 * unit-tested in Node and reused by any renderer.
 *
 * Coordinate convention: surfaces return mathematical coordinates [x, y, z] with z up.
 * The renderer is responsible for mapping these into its own frame.
 *
 * @typedef {Object} ParamSpec
 * @property {string} id        Key used in the params object and in the URL.
 * @property {string} label     Human-readable label.
 * @property {number} min
 * @property {number} max
 * @property {number} step
 * @property {number} default   Must lie within [min, max].
 *
 * @typedef {Object} Topology
 * @property {boolean} closed            Compact without boundary.
 * @property {boolean} orientable
 * @property {number|null} eulerChar     Euler characteristic χ (null if not meaningful, e.g. unbounded graphs).
 * @property {number|null} genus         Orientable genus, or non-orientable genus (crosscap number).
 * @property {number} boundaryComponents
 * @property {string} note               Short explanation shown in the UI.
 *
 * @typedef {Object} Surface
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {'graph'|'parametric'|'implicit'} kind
 *   graph/parametric surfaces define uRange, vRange and evaluate(u, v, p).
 *   implicit surfaces define field(x, y, z, p) (negative inside), bounds(p) and
 *   featureSize(p) (thinnest detail, used to pick the grid spacing) instead.
 * @property {ParamSpec[]} params
 * @property {[number, number]} [uRange]
 * @property {[number, number]} [vRange]
 * @property {(u: number, v: number, p: Record<string, number>) => [number, number, number]} [evaluate]
 * @property {(x: number, y: number, z: number, p: Record<string, number>) => number} [field]
 * @property {(p: Record<string, number>) => { min: [number, number, number], max: [number, number, number] }} [bounds]
 * @property {(p: Record<string, number>) => number} [featureSize]
 * @property {Topology | ((p: Record<string, number>) => Topology)} topology
 *   Static, or a function of the parameters when a slider can change the topology.
 * @property {[number, number]} [probe]  (u, v) where the "local invariants" panel samples
 *   the surface. Defaults to the centre of the domain.
 */

const TAU = Math.PI * 2;

/** @type {Surface[]} */
export const SURFACES = [
  {
    id: "wave",
    name: "Wave graph",
    description:
      "z = a·sin(f·x)·cos(f·y). Amplitude and frequency change the geometry (bending, curvature) but never the topology: it is always a disc.",
    kind: "graph",
    params: [
      { id: "amplitude", label: "Amplitude a", min: 0, max: 2, step: 0.01, default: 0.75 },
      { id: "frequency", label: "Frequency f", min: 1, max: 10, step: 1, default: 3 }
    ],
    uRange: [-2, 2],
    vRange: [-2, 2],
    evaluate: (x, y, p) => [x, y, p.amplitude * Math.sin(p.frequency * x) * Math.cos(p.frequency * y)],
    topology: {
      closed: false,
      orientable: true,
      eulerChar: 1,
      genus: 0,
      boundaryComponents: 1,
      note: "A square patch is a topological disc (χ = 1), whatever its height function."
    }
  },
  {
    id: "saddle",
    name: "Saddle (hyperbolic paraboloid)",
    description: "z = a·(x² − y²). Gaussian curvature is negative everywhere: the surface bends up in one direction and down in the other.",
    kind: "graph",
    params: [{ id: "a", label: "Steepness a", min: 0, max: 1.5, step: 0.01, default: 0.4 }],
    uRange: [-2, 2],
    vRange: [-2, 2],
    evaluate: (x, y, p) => [x, y, p.a * (x * x - y * y)],
    topology: {
      closed: false,
      orientable: true,
      eulerChar: 1,
      genus: 0,
      boundaryComponents: 1,
      note: "Still a disc (χ = 1). Compare its K < 0 with the sphere's K > 0."
    }
  },
  {
    id: "sphere",
    name: "Sphere",
    description: "Constant positive curvature K = 1/R². Changing R rescales K but ∫K dA stays 4π.",
    kind: "parametric",
    params: [{ id: "R", label: "Radius R", min: 0.5, max: 2.5, step: 0.01, default: 1.5 }],
    uRange: [0, TAU],
    vRange: [0, Math.PI],
    evaluate: (u, v, p) => [
      p.R * Math.sin(v) * Math.cos(u),
      p.R * Math.sin(v) * Math.sin(u),
      p.R * Math.cos(v)
    ],
    topology: {
      closed: true,
      orientable: true,
      eulerChar: 2,
      genus: 0,
      boundaryComponents: 0,
      note: "Genus 0, χ = 2. Gauss–Bonnet: ∫K dA = 2πχ = 4π for any radius."
    }
  },
  {
    id: "torus",
    name: "Torus",
    description:
      "Outer half has K > 0, inner half K < 0. Changing R and r reshapes the curvature, but the positive and negative parts always cancel.",
    kind: "parametric",
    params: [
      { id: "R", label: "Major radius R", min: 0.8, max: 2.5, step: 0.01, default: 1.6 },
      { id: "r", label: "Minor radius r", min: 0.1, max: 0.79, step: 0.01, default: 0.6 }
    ],
    uRange: [0, TAU],
    vRange: [0, TAU],
    evaluate: (u, v, p) => {
      const w = p.R + p.r * Math.cos(v);
      return [w * Math.cos(u), w * Math.sin(u), p.r * Math.sin(v)];
    },
    topology: {
      closed: true,
      orientable: true,
      eulerChar: 0,
      genus: 1,
      boundaryComponents: 0,
      note: "Genus 1, χ = 0. Gauss–Bonnet: ∫K dA = 0 — the red and blue regions balance exactly."
    }
  },
  {
    id: "mobius",
    name: "Möbius strip",
    description: "One side, one edge. Watch the shading flip across the seam: no consistent normal exists.",
    kind: "parametric",
    params: [
      { id: "radius", label: "Radius", min: 0.8, max: 2.5, step: 0.01, default: 1.6 },
      { id: "width", label: "Half-width", min: 0.1, max: 0.79, step: 0.01, default: 0.6 }
    ],
    uRange: [0, TAU],
    vRange: [-1, 1],
    evaluate: (u, v, p) => {
      const s = v * p.width;
      const w = p.radius + s * Math.cos(u / 2);
      return [w * Math.cos(u), w * Math.sin(u), s * Math.sin(u / 2)];
    },
    topology: {
      closed: false,
      orientable: false,
      eulerChar: 0,
      genus: 1,
      boundaryComponents: 1,
      note: "Non-orientable, χ = 0, a single boundary circle. Gauss–Bonnet needs a boundary term here, so ∫K dA alone is not 2πχ."
    }
  },
  {
    id: "klein",
    name: "Klein bottle (figure-8 immersion)",
    description:
      "A closed non-orientable surface. In 3D it must pass through itself; this figure-8 version is an immersion, so self-intersections are expected.",
    kind: "parametric",
    params: [{ id: "r", label: "Tube radius r", min: 1, max: 3, step: 0.01, default: 2 }],
    uRange: [0, TAU],
    vRange: [0, TAU],
    evaluate: (u, v, p) => {
      const s = 0.5; // scale so the default fits next to the other surfaces
      const c = Math.cos(u / 2);
      const d = Math.sin(u / 2);
      const w = p.r + c * Math.sin(v) - d * Math.sin(2 * v);
      return [s * w * Math.cos(u), s * w * Math.sin(u), s * (d * Math.sin(v) + c * Math.sin(2 * v))];
    },
    topology: {
      closed: true,
      orientable: false,
      eulerChar: 0,
      genus: 2,
      boundaryComponents: 0,
      note: "Non-orientable genus 2 (two crosscaps), χ = 0. Gauss–Bonnet still holds: ∫K dA = 0."
    }
  },
  {
    id: "bonnet",
    name: "Catenoid ↔ helicoid (Bonnet family)",
    description:
      "X_t = cos θ·catenoid + sin θ·helicoid, θ = t·90°. Every member has the same metric and the same mean curvature H = 0, yet the shapes are not congruent. Watch the local-invariants panel: E, F, G and H stay fixed while L, M, N change.",
    kind: "parametric",
    params: [{ id: "t", label: "Bend t (0 = catenoid, 1 = helicoid)", min: 0, max: 1, step: 0.01, default: 0.35 }],
    uRange: [0, TAU],
    vRange: [-1.2, 1.2],
    probe: [Math.PI / 3, 0.6],
    evaluate: (u, v, p) => {
      const theta = (p.t * Math.PI) / 2;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const ch = Math.cosh(v);
      const sh = Math.sinh(v);
      // Catenoid (ch cos u, ch sin u, v) and its conjugate helicoid (sh sin u, −sh cos u, u),
      // re-centred vertically (a translation does not affect the metric).
      return [
        c * ch * Math.cos(u) + s * sh * Math.sin(u),
        c * ch * Math.sin(u) - s * sh * Math.cos(u),
        c * v + s * (u - Math.PI)
      ];
    },
    topology: (p) =>
      p.t === 0
        ? {
            closed: false,
            orientable: true,
            eulerChar: 0,
            genus: 0,
            boundaryComponents: 2,
            note: "At t = 0 the strip closes up into a catenoid: an annulus (χ = 0, two boundary circles)."
          }
        : {
            closed: false,
            orientable: true,
            eulerChar: 1,
            genus: 0,
            boundaryComponents: 1,
            note: "For t > 0 the seam opens and the strip becomes a piece of a helicoid: a disc (χ = 1). The bending is a local isometry, so the global gluing is lost."
          }
  },
  {
    id: "genus",
    name: "Genus-g surface (add handles)",
    description:
      "A closed surface built as a smooth union of g overlapping tori — the connected sum of g tori. Each handle you add lowers χ by 2. Total curvature follows: ∫K dA = 2π(2 − 2g).",
    kind: "implicit",
    params: [
      { id: "handles", label: "Handles g", min: 0, max: 4, step: 1, default: 2 },
      { id: "r", label: "Tube radius r", min: 0.2, max: 0.45, step: 0.01, default: 0.32 }
    ],
    field: genusField,
    bounds: (p) => {
      const g = p.handles;
      const half = g === 0 ? SPHERE_RADIUS + 0.3 : ((g - 1) * TORUS_SPACING) / 2 + 1 + p.r + 0.3;
      const side = g === 0 ? SPHERE_RADIUS + 0.3 : 1 + p.r + 0.3;
      const up = g === 0 ? SPHERE_RADIUS + 0.3 : p.r + 0.3;
      return { min: [-half, -side, -up], max: [half, side, up] };
    },
    featureSize: (p) => (p.handles === 0 ? SPHERE_RADIUS : 2 * p.r),
    topology: (p) => ({
      closed: true,
      orientable: true,
      eulerChar: 2 - 2 * p.handles,
      genus: p.handles,
      boundaryComponents: 0,
      note:
        p.handles === 0
          ? "No handles: a sphere, χ = 2. Add one and you get a torus (χ = 0)."
          : `Connected sum of ${p.handles} ${p.handles === 1 ? "torus" : "tori"}: χ(A # B) = χ(A) + χ(B) − 2, so each handle subtracts 2 → χ = ${2 - 2 * p.handles}.`
    })
  }
];

const SPHERE_RADIUS = 1.15;
const TORUS_SPACING = 1.8;
const BLEND = 0.12;

/**
 * Smooth union (log-sum-exp) of g tori in a row, each with major radius 1 and tube
 * radius r. Neighbours overlap enough to merge but leave every hole open, so the
 * result is a single closed surface of genus g. g = 0 gives a sphere.
 */
function genusField(x, y, z, p) {
  const g = p.handles;
  if (g === 0) return Math.hypot(x, y, z) - SPHERE_RADIUS;
  let sum = 0;
  for (let i = 0; i < g; i++) {
    const cx = (i - (g - 1) / 2) * TORUS_SPACING;
    const q = Math.hypot(x - cx, y) - 1;
    const d = Math.hypot(q, z) - p.r;
    sum += Math.exp(-d / BLEND);
  }
  return -BLEND * Math.log(sum);
}

/** Default surface id — matches the original single-surface demo. */
export const DEFAULT_SURFACE_ID = "wave";

const BY_ID = new Map(SURFACES.map((s) => [s.id, s]));

/**
 * @param {string} id
 * @returns {Surface | undefined}
 */
export function getSurface(id) {
  return BY_ID.get(id);
}

/**
 * Topology for the given parameters (handles both static and parameter-dependent entries).
 * @param {Surface} surface
 * @param {Record<string, number>} params
 * @returns {Topology}
 */
export function topologyOf(surface, params) {
  return typeof surface.topology === "function" ? surface.topology(params) : surface.topology;
}

/**
 * (u, v) sampled by the local-invariants panel.
 * @param {Surface} surface
 * @returns {[number, number]}
 */
export function probePoint(surface) {
  if (surface.probe) return surface.probe;
  return [(surface.uRange[0] + surface.uRange[1]) / 2, (surface.vRange[0] + surface.vRange[1]) / 2];
}

/**
 * @param {Surface} surface
 * @returns {Record<string, number>} params object filled with defaults
 */
export function defaultParams(surface) {
  return Object.fromEntries(surface.params.map((p) => [p.id, p.default]));
}
