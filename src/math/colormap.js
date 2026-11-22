/**
 * Diverging colour map for signed scalar fields (curvature).
 * negative → blue, zero → neutral, positive → red.
 */

export const NEGATIVE = [0.17, 0.42, 0.85];
export const NEUTRAL = [0.88, 0.89, 0.9];
export const POSITIVE = [0.85, 0.22, 0.2];
/** Colour used for undefined values (degenerate points). */
export const UNDEFINED = [0.5, 0.5, 0.5];

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * @param {number} value
 * @param {number} limit  Values with |value| ≥ limit get the fully saturated colour.
 * @returns {[number, number, number]} RGB in [0, 1]
 */
export function divergingColor(value, limit) {
  if (!Number.isFinite(value)) return UNDEFINED;
  if (!(limit > 0)) return NEUTRAL;
  const t = Math.max(-1, Math.min(1, value / limit));
  return t < 0 ? lerp(NEUTRAL, NEGATIVE, -t) : lerp(NEUTRAL, POSITIVE, t);
}

/**
 * Robust symmetric colour limit: the given percentile of |value|, ignoring NaN.
 * Using a percentile instead of the max stops a few extreme values (e.g. near a
 * self-intersection) from washing out the rest of the surface.
 *
 * @param {ArrayLike<number>} values
 * @param {number} [percentile=0.98]
 */
export function robustLimit(values, percentile = 0.98) {
  const abs = [];
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (Number.isFinite(x)) abs.push(Math.abs(x));
  }
  if (abs.length === 0) return 0;
  abs.sort((a, b) => a - b);
  const idx = Math.min(abs.length - 1, Math.floor(percentile * (abs.length - 1)));
  const lim = abs[idx];
  // Treat numerically-zero fields (e.g. a flat plane, ~1e-9 noise) as exactly zero.
  return lim < 1e-6 ? 0 : lim;
}

/**
 * @param {ArrayLike<number>} values
 * @param {number} limit
 * @returns {Float32Array} packed RGB triples
 */
export function colorize(values, limit) {
  const out = new Float32Array(values.length * 3);
  for (let i = 0; i < values.length; i++) {
    const c = divergingColor(values[i], limit);
    out[i * 3] = c[0];
    out[i * 3 + 1] = c[1];
    out[i * 3 + 2] = c[2];
  }
  return out;
}
