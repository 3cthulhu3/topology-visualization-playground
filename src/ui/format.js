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
 * @returns {{ value: string, note: string, matches: boolean | null }}
 *   matches is null when the theorem (without boundary term) does not apply.
 */
export function gaussBonnetSummary(topology, totalK) {
  const ratio = totalK / (2 * Math.PI);
  const value = formatNumber(ratio, 3);

  if (!Number.isFinite(ratio)) {
    return { value, note: "Could not integrate curvature for these parameters.", matches: null };
  }

  if (topology.closed && topology.eulerChar !== null) {
    const matches = Math.abs(ratio - topology.eulerChar) < 0.02;
    return {
      value,
      matches,
      note: matches
        ? `Equals χ = ${topology.eulerChar}. Change the parameters: the curvature moves around, but this number stays put.`
        : `Expected χ = ${topology.eulerChar}; the numerical error is larger than usual for these parameters.`
    };
  }

  return {
    value,
    matches: null,
    note:
      "This surface has a boundary, so Gauss–Bonnet adds a boundary term ∮k_g ds. On its own this number is geometric, not topological: stretching changes it (try the wave graph), bending without stretching does not (try the Bonnet family)."
  };
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
