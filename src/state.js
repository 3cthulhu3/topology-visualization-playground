/**
 * Application state: validation and (de)serialisation to the URL hash, so any
 * view can be shared as a link. Pure functions only — no DOM access.
 */

import { DEFAULT_SURFACE_ID, defaultParams, getSurface } from "./math/surfaces.js";

export const COLOR_MODES = ["gaussian", "mean", "solid"];
export const DEFAULT_COLOR_MODE = "gaussian";

/** Overlay tools for parametric surfaces. */
export const TOOLS = ["none", "fan", "transport"];

/**
 * Slider specs for each tool. Ids are prefixed so they can never collide with a
 * surface parameter in the URL. Start points and loops are given as fractions of the
 * parameter range, so one link works on every surface.
 */
export const TOOL_PARAMS = {
  fan: [
    { id: "g_u", label: "Start u (fraction of range)", min: 0, max: 1, step: 0.01, default: 0.6 },
    { id: "g_v", label: "Start v (fraction of range)", min: 0, max: 1, step: 0.01, default: 0.3 },
    { id: "g_dir", label: "Direction (°)", min: 0, max: 360, step: 1, default: 0 },
    { id: "g_spread", label: "Spread (°)", min: 0, max: 120, step: 1, default: 40 },
    { id: "g_len", label: "Length", min: 0.5, max: 15, step: 0.1, default: 4.7 }
  ],
  transport: [{ id: "loop_v", label: "Loop position v (fraction of range)", min: 0.02, max: 0.98, step: 0.01, default: 0.3 }]
};

const ALL_TOOL_PARAMS = [...TOOL_PARAMS.fan, ...TOOL_PARAMS.transport];

/** URL keys that are not surface parameters. */
export const RESERVED_URL_KEYS = ["surface", "color", "wireframe", "tool", ...ALL_TOOL_PARAMS.map((p) => p.id)];

function defaultToolParams() {
  return Object.fromEntries(ALL_TOOL_PARAMS.map((p) => [p.id, p.default]));
}

/**
 * @typedef {Object} AppState
 * @property {string} surfaceId
 * @property {Record<string, number>} params
 * @property {'gaussian'|'mean'|'solid'} colorMode
 * @property {boolean} wireframe
 * @property {'none'|'fan'|'transport'} tool
 * @property {Record<string, number>} toolParams
 */

/** @returns {AppState} */
export function defaultState(surfaceId = DEFAULT_SURFACE_ID) {
  const surface = getSurface(surfaceId) ?? getSurface(DEFAULT_SURFACE_ID);
  return {
    surfaceId: surface.id,
    params: defaultParams(surface),
    colorMode: DEFAULT_COLOR_MODE,
    wireframe: false,
    tool: "none",
    toolParams: defaultToolParams()
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
  const toolParams = {};
  for (const spec of ALL_TOOL_PARAMS) {
    const raw = input.toolParams?.[spec.id];
    toolParams[spec.id] = raw === undefined || raw === null || raw === "" ? spec.default : clampParam(spec, Number(raw));
  }
  return {
    surfaceId: surface.id,
    params,
    colorMode: COLOR_MODES.includes(input.colorMode) ? input.colorMode : base.colorMode,
    wireframe: input.wireframe === true,
    tool: TOOLS.includes(input.tool) ? input.tool : "none",
    toolParams
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
  if (state.tool !== "none") {
    q.set("tool", state.tool);
    for (const spec of TOOL_PARAMS[state.tool]) q.set(spec.id, String(state.toolParams[spec.id]));
  }
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
  const toolParams = {};
  for (const spec of ALL_TOOL_PARAMS) {
    if (q.has(spec.id)) toolParams[spec.id] = q.get(spec.id);
  }
  return normalizeState({
    surfaceId,
    params,
    colorMode: q.get("color") ?? undefined,
    wireframe: q.get("wireframe") === "1",
    tool: q.get("tool") ?? undefined,
    toolParams
  });
}
