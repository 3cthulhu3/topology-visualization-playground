/** Pure formatting helpers for the side panel (unit-tested, no DOM). */

/** Number of decimals implied by a slider step, e.g. 0.01 → 2, 1 → 0. */
export function stepDecimals(step) {
  return (String(step).split(".")[1] ?? "").length;
}

/** Compact number formatting that survives NaN/±Infinity. */
export function formatNumber(x, digits = 3) {
  if (!Number.isFinite(x)) return "–";
  if (Math.abs(x) < 10 ** -digits) return "0";
  return x.toFixed(digits);
}

/**
 * Builds the Gauss–Bonnet readout for the current surface.
 *
 * @param {import('../math/surfaces.js').Topology} topology
 * @param {number} totalK  ∫K dA
 * @param {{ meshEstimate?: boolean }} [options]  meshEstimate: ∫K dA came from a triangle
 *   mesh (implicit surfaces) rather than the exact parametrisation, so it carries a small
 *   discretisation error that shrinks as the grid is refined.
 * @returns {{ value: string, note: string, matches: boolean | null }}
 *   matches is null when the theorem (without boundary term) does not apply.
 */
export function gaussBonnetSummary(topology, totalK, options = {}) {
  const ratio = totalK / (2 * Math.PI);
  const value = formatNumber(ratio, 3);

  if (!Number.isFinite(ratio)) {
    return { value, note: "Could not integrate curvature for these parameters.", matches: null };
  }

  if (topology.closed && topology.eulerChar !== null) {
    const chi = topology.eulerChar;
    const tolerance = gaussBonnetTolerance(chi, options.meshEstimate);
    const matches = Math.abs(ratio - chi) < tolerance;
    const verdict = options.meshEstimate
      ? `Matches χ = ${chi} up to discretisation error (a mesh estimate that converges to χ as the grid is refined)`
      : `Equals χ = ${chi}`;
    return {
      value,
      matches,
      note: matches
        ? `${verdict}. Change the parameters: the curvature moves around, but this number stays put.`
        : `Expected χ = ${chi}; the numerical error is larger than usual for these parameters.`
    };
  }

  return {
    value,
    matches: null,
    note:
      "This surface has a boundary, so Gauss–Bonnet adds a boundary term ∮k_g ds. On its own this number is geometric, not topological: stretching changes it (try the wave graph), bending without stretching does not (try the Bonnet family)."
  };
}

/**
 * How close ∫K dA / 2π must be to χ to count as a match. Exact parametrisations are
 * integrated to ~1e-4; implicit surfaces are integrated over a marching-tetrahedra mesh
 * whose error grows with the amount of curvature (≈ 1 % of |χ| at the default grid).
 */
export function gaussBonnetTolerance(chi, meshEstimate = false) {
  return meshEstimate ? 0.02 + 0.02 * Math.abs(chi) : 0.02;
}

/** Text for the topology facts list. */
export function topologyFacts(topology) {
  return {
    chi: topology.eulerChar === null ? "–" : String(topology.eulerChar),
    orientable: topology.orientable ? "Yes" : "No",
    genusLabel: topology.orientable ? "Genus" : "Non-orientable genus (crosscaps)",
    genus: topology.genus === null ? "–" : String(topology.genus),
    boundary: String(topology.boundaryComponents)
  };
}

/**
 * Rows for the local-invariants table. Grouped so the reader can see at a glance
 * which numbers are intrinsic (survive bending) and which are extrinsic.
 *
 * @param {{E:number,F:number,G:number,L:number,M:number,N:number,K:number,H:number}} d
 * @returns {{ group: string, label: string, value: string, groupStart: boolean }[]}
 */
export function invariantRows(d) {
  const rows = [
    ["intrinsic", "E  (metric)", d.E],
    ["intrinsic", "F  (metric)", d.F],
    ["intrinsic", "G  (metric)", d.G],
    ["intrinsic", "K  (Gaussian curvature)", d.K],
    ["extrinsic", "H  (mean curvature)", d.H],
    ["extrinsic", "L  (2nd fundamental form)", d.L],
    ["extrinsic", "M  (2nd fundamental form)", d.M],
    ["extrinsic", "N  (2nd fundamental form)", d.N]
  ];
  return rows.map(([group, label, value], i) => ({
    group,
    label,
    value: formatNumber(value, 4),
    groupStart: i === 0 || rows[i - 1][0] !== group
  }));
}

/**
 * Text for the "mesh count" row: χ counted from the triangle mesh itself.
 * @param {{ V: number, E: number, F: number, chi: number }} counts
 * @param {number | null} expected  χ from the surface's topology metadata
 */
export function meshCountSummary(counts, expected) {
  return {
    value: String(counts.chi),
    detail: `V − E + F = ${counts.V} − ${counts.E} + ${counts.F}`,
    matches: expected === null ? null : counts.chi === expected
  };
}
