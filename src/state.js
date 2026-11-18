/**
 * Application state: validation and (de)serialisation to the URL hash, so any
 * view can be shared as a link. Pure functions only — no DOM access.
 */

import { DEFAULT_SURFACE_ID, defaultParams, getSurface } from "./math/surfaces.js";

export const COLOR_MODES = ["gaussian", "mean", "solid"];
export const DEFAULT_COLOR_MODE = "gaussian";

/**
 * @typedef {Object} AppState
 * @property {string} surfaceId
 * @property {Record<string, number>} params
 * @property {'gaussian'|'mean'|'solid'} colorMode
 * @property {boolean} wireframe
 */

/** @returns {AppState} */
export function defaultState(surfaceId = DEFAULT_SURFACE_ID) {
  const surface = getSurface(surfaceId) ?? getSurface(DEFAULT_SURFACE_ID);
  return {
    surfaceId: surface.id,
    params: defaultParams(surface),
    colorMode: DEFAULT_COLOR_MODE,
    wireframe: false
  };
}

/** Clamp to [min, max] and round to the slider step so URLs stay tidy. */
export function clampParam(spec, value) {
  if (!Number.isFinite(value)) return spec.default;
  const clamped = Math.min(spec.max, Math.max(spec.min, value));
  const decimals = (String(spec.step).split(".")[1] ?? "").length;
  return Number(clamped.toFixed(decimals));
}

/**
 * Returns a fully valid state, filling missing or invalid pieces with defaults.
 * @param {Partial<AppState> & { params?: Record<string, unknown> }} input
 * @returns {AppState}
 */
export function normalizeState(input = {}) {
  const base = defaultState(input.surfaceId);
  const surface = getSurface(base.surfaceId);
  const params = {};
  for (const spec of surface.params) {
    const raw = input.params?.[spec.id];
    params[spec.id] = raw === undefined || raw === null || raw === "" ? spec.default : clampParam(spec, Number(raw));
  }
  return {
    surfaceId: surface.id,
    params,
    colorMode: COLOR_MODES.includes(input.colorMode) ? input.colorMode : base.colorMode,
    wireframe: input.wireframe === true
  };
}

/**
 * @param {AppState} state
 * @returns {string} hash without the leading '#'
 */
export function stateToHash(state) {
  const q = new URLSearchParams();
  q.set("surface", state.surfaceId);
  for (const [k, v] of Object.entries(state.params)) q.set(k, String(v));
  q.set("color", state.colorMode);
  if (state.wireframe) q.set("wireframe", "1");
  return q.toString();
}

/**
 * Never throws: anything unparseable falls back to defaults.
 * @param {string} hash  with or without the leading '#'
 * @returns {AppState}
 */
export function hashToState(hash) {
  let q;
  try {
    q = new URLSearchParams(String(hash ?? "").replace(/^#/, ""));
  } catch {
    return defaultState();
  }
  const surfaceId = q.get("surface") ?? undefined;
  const surface = getSurface(surfaceId) ?? getSurface(DEFAULT_SURFACE_ID);
  const params = {};
  for (const spec of surface.params) {
    if (q.has(spec.id)) params[spec.id] = q.get(spec.id);
  }
  return normalizeState({
    surfaceId,
    params,
    colorMode: q.get("color") ?? undefined,
    wireframe: q.get("wireframe") === "1"
  });
}
