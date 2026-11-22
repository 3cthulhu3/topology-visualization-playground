/**
 * Wires state ↔ UI ↔ viewer. The data flow is one-directional:
 *
 *   user input → state (validated) → URL hash
 *                                  → buildMesh()        → viewer.setMesh / setColors
 *                                  → totalCurvature()   → Gauss–Bonnet panel
 *                                  → meshEulerCharacteristic() → topology panel
 */

import { SURFACES, getSurface, probePoint, topologyOf } from "./math/surfaces.js";
import { buildMesh, totalCurvature } from "./math/mesh.js";
import { localInvariants } from "./math/curvature.js";
import { meshEulerCharacteristic } from "./math/topology.js";
import { colorize, robustLimit } from "./math/colormap.js";
import { TOOL_PARAMS, defaultState, hashToState, normalizeState, stateToHash } from "./state.js";
import { arrowsToSegments, geodesicFan, holonomyComparison, polylinesToSegments } from "./math/geodesics.js";
import { createViewer } from "./render/viewer.js";
import {
  formatNumber,
  gaussBonnetSummary,
  invariantRows,
  fanReadout,
  meshCountSummary,
  stepDecimals,
  transportReadout,
  topologyFacts
} from "./ui/format.js";

/** Number of geodesics in a fan. */
const FAN_COUNT = 7;
const COLORS = { geodesic: 0xffd166, loop: 0xffffff, transported: 0x4ade80, startVector: 0x22d3ee, endVector: 0xf472b6 };

/** Wait this long after the last slider movement before re-integrating. */
const INTEGRATION_DEBOUNCE_MS = 120;

export function init(doc = document) {
  const $ = (id) => {
    const el = doc.getElementById(id);
    if (!el) throw new Error(`Missing element #${id} in index.html`);
    return el;
  };

  const els = {
    container: $("scene-container"),
    surface: $("surface"),
    surfaceDescription: $("surfaceDescription"),
    params: $("paramControls"),
    colorMode: $("colorMode"),
    legend: $("legend"),
    legendMin: $("legendMin"),
    legendMax: $("legendMax"),
    wireframe: $("wireframe"),
    autorotate: $("autorotate"),
    resetView: $("resetViewBtn"),
    resetParams: $("resetParamsBtn"),
    copyLink: $("copyLinkBtn"),
    status: $("status"),
    factChi: $("factChi"),
    factOrientable: $("factOrientable"),
    factGenusLabel: $("factGenusLabel"),
    factGenus: $("factGenus"),
    factBoundary: $("factBoundary"),
    topologyNote: $("topologyNote"),
    factMeshChi: $("factMeshChi"),
    meshCounts: $("meshCounts"),
    tool: $("tool"),
    toolParams: $("toolParams"),
    toolReadout: $("toolReadout"),
    probePanel: $("probePanel"),
    probeWhere: $("probeWhere"),
    probeRows: $("probeRows"),
    gbValue: $("gbValue"),
    gbNote: $("gbNote"),
    kRange: $("kRange")
  };

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  let state = hashToState(location.hash);
  /** @type {import('./math/mesh.js').MeshData | null} */
  let mesh = null;

  const viewer = createViewer(els.container, { autoRotate: !reducedMotion });
  els.autorotate.checked = !reducedMotion;

  // ---------- UI construction ----------

  for (const s of SURFACES) {
    const opt = doc.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    els.surface.append(opt);
  }

  /**
   * One labelled range input with a live <output>.
   * @param {import('./math/surfaces.js').ParamSpec} spec
   * @param {number} value
   * @param {string} idPrefix
   * @param {(value: number) => number} onChange  returns the validated value to display
   */
  function createSlider(spec, value, idPrefix, onChange) {
    const id = `${idPrefix}-${spec.id}`;
    const wrap = doc.createElement("div");
    wrap.className = "param";

    const label = doc.createElement("label");
    label.htmlFor = id;
    label.textContent = spec.label;

    const row = doc.createElement("div");
    row.className = "slider-row";

    const input = doc.createElement("input");
    Object.assign(input, { type: "range", id, min: spec.min, max: spec.max, step: spec.step });
    input.value = String(value);
    input.dataset.spec = spec.id;

    const output = doc.createElement("output");
    output.htmlFor = id;
    output.textContent = Number(value).toFixed(stepDecimals(spec.step));

    input.addEventListener("input", () => {
      const shown = onChange(Number(input.value));
      output.textContent = shown.toFixed(stepDecimals(spec.step));
    });

    row.append(input, output);
    wrap.append(label, row);
    return wrap;
  }

  function renderParamControls() {
    const surface = getSurface(state.surfaceId);
    els.params.querySelectorAll(".param").forEach((n) => n.remove());
    for (const spec of surface.params) {
      els.params.append(
        createSlider(spec, state.params[spec.id], "param", (value) => {
          state = normalizeState({ ...state, params: { ...state.params, [spec.id]: value } });
          schedule({ geometry: true });
          return state.params[spec.id];
        })
      );
    }
  }

  function renderToolControls() {
    els.toolParams.innerHTML = "";
    for (const spec of TOOL_PARAMS[state.tool] ?? []) {
      els.toolParams.append(
        createSlider(spec, state.toolParams[spec.id], "tool", (value) => {
          state = normalizeState({ ...state, toolParams: { ...state.toolParams, [spec.id]: value } });
          schedule({ overlays: true });
          return state.toolParams[spec.id];
        })
      );
    }
  }

  function syncControls() {
    const surface = getSurface(state.surfaceId);
    els.surface.value = state.surfaceId;
    els.surfaceDescription.textContent = surface.description;
    els.colorMode.value = state.colorMode;
    els.wireframe.checked = state.wireframe;

    for (const input of els.params.querySelectorAll("input[data-spec]")) {
      const spec = surface.params.find((p) => p.id === input.dataset.spec);
      input.value = String(state.params[spec.id]);
      input.nextElementSibling.textContent = state.params[spec.id].toFixed(stepDecimals(spec.step));
    }
    els.tool.value = state.tool;
    for (const input of els.toolParams.querySelectorAll("input[data-spec]")) {
      const spec = TOOL_PARAMS[state.tool].find((p) => p.id === input.dataset.spec);
      input.value = String(state.toolParams[spec.id]);
      input.nextElementSibling.textContent = state.toolParams[spec.id].toFixed(stepDecimals(spec.step));
    }

  }

  /** Topology can depend on parameters (e.g. the Bonnet family), so refresh it per geometry update. */
  function renderTopology() {
    const surface = getSurface(state.surfaceId);
    const topology = topologyOf(surface, state.params);
    const facts = topologyFacts(topology);
    els.factChi.textContent = facts.chi;
    els.factOrientable.textContent = facts.orientable;
    els.factGenusLabel.textContent = facts.genusLabel;
    els.factGenus.textContent = facts.genus;
    els.factBoundary.textContent = facts.boundary;
    els.topologyNote.textContent = topology.note;

    // χ counted from the mesh: welded for parametric surfaces (seams, poles), as-is for
    // implicit ones (marching tetrahedra already shares vertices).
    const counts = meshEulerCharacteristic(mesh, { weld: surface.kind !== "implicit" });
    const summary = meshCountSummary(counts, topology.eulerChar);
    els.factMeshChi.textContent = `χ = ${summary.value}`;
    els.factMeshChi.dataset.matches = String(summary.matches);
    els.meshCounts.textContent = summary.detail;
  }

  function renderProbe() {
    const surface = getSurface(state.surfaceId);
    // Implicit surfaces have no (u, v) parameters, hence no fundamental forms to show.
    els.probePanel.hidden = surface.kind === "implicit";
    if (surface.kind === "implicit") return;
    const uv = probePoint(surface);
    const d = localInvariants(surface, state.params, uv);
    els.probeWhere.textContent = `(u, v) = (${formatNumber(uv[0], 2)}, ${formatNumber(uv[1], 2)})`;
    els.probeRows.innerHTML = "";
    for (const row of invariantRows(d)) {
      const tr = doc.createElement("tr");
      if (row.groupStart) tr.className = "group-start";
      const kind = doc.createElement("td");
      kind.className = "kind";
      kind.textContent = row.groupStart ? row.group : "";
      const label = doc.createElement("td");
      label.textContent = row.label;
      const value = doc.createElement("td");
      value.className = "mono";
      value.textContent = row.value;
      tr.append(kind, label, value);
      els.probeRows.append(tr);
    }
  }

  // ---------- Rendering pipeline (coalesced to one update per frame) ----------

  const pending = { geometry: false, colors: false, frame: false, overlays: false };
  let scheduled = false;
  let integrationTimer = 0;

  function schedule(flags) {
    Object.assign(pending, Object.fromEntries(Object.entries(flags).filter(([, v]) => v)));
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  }

  function flush() {
    scheduled = false;
    const surface = getSurface(state.surfaceId);

    if (pending.geometry || !mesh) {
      mesh = buildMesh(surface, state.params);
      viewer.setMesh(mesh);
      els.kRange.textContent = `K ∈ [${formatNumber(mesh.stats.minK)}, ${formatNumber(mesh.stats.maxK)}]`;
      renderTopology();
      renderProbe();
      scheduleIntegration();
      pending.colors = true;
      pending.overlays = true;
    }
    if (pending.colors) applyColors();
    if (pending.overlays) renderOverlays();
    if (pending.frame) viewer.frame();
    viewer.setWireframe(state.wireframe);

    pending.geometry = pending.colors = pending.frame = pending.overlays = false;
    history.replaceState(null, "", `#${stateToHash(state)}`);
  }

  function applyColors() {
    if (state.colorMode === "solid") {
      viewer.setColors(null);
      els.legend.hidden = true;
      return;
    }
    const values = state.colorMode === "gaussian" ? mesh.gaussian : mesh.mean;
    const limit = robustLimit(values);
    viewer.setColors(colorize(values, limit));
    const symbol = state.colorMode === "gaussian" ? "K" : "H";
    els.legend.hidden = false;
    els.legendMin.textContent = `${symbol} ≤ −${formatNumber(limit, 2)}`;
    els.legendMax.textContent = `${symbol} ≥ ${formatNumber(limit, 2)}`;
  }

  /** Size of the current mesh, used to scale line offsets and arrow lengths. */
  function meshScale() {
    const P = mesh.positions;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i++) {
      const k = i % 3;
      if (P[i] < min[k]) min[k] = P[i];
      if (P[i] > max[k]) max[k] = P[i];
    }
    return Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  }

  function renderOverlays() {
    const surface = getSurface(state.surfaceId);
    const implicit = surface.kind === "implicit";
    els.tool.disabled = implicit;
    els.toolParams.hidden = implicit;
    delete els.toolReadout.dataset.matches;
    if (implicit || state.tool === "none") {
      viewer.setOverlays([]);
      els.toolReadout.textContent = implicit
        ? "Geodesics and parallel transport are computed in (u, v) coordinates, so they are available on parametric surfaces."
        : "";
      return;
    }

    const scale = meshScale();
    const offset = 0.004 * scale;
    const arrow = 0.05 * scale;
    const tp = state.toolParams;
    const at = (frac, [a, b]) => a + frac * (b - a);
    const rad = (d) => (d * Math.PI) / 180;

    if (state.tool === "fan") {
      const start = [at(tp.g_u, surface.uRange), at(tp.g_v, surface.vRange)];
      const fan = geodesicFan(surface, state.params, {
        start,
        direction: rad(tp.g_dir),
        spread: rad(tp.g_spread),
        count: FAN_COUNT,
        length: tp.g_len
      });
      viewer.setOverlays([{ segments: polylinesToSegments(fan, offset), color: COLORS.geodesic }]);
      els.toolReadout.textContent = fanReadout({
        K: localInvariants(surface, state.params, start).K,
        count: FAN_COUNT,
        stopped: {
          boundary: fan.filter((g) => g.stopped === "boundary").length,
          singular: fan.filter((g) => g.stopped === "singular").length
        }
      });
      return;
    }

    const comparison = holonomyComparison(surface, state.params, at(tp.loop_v, surface.vRange));
    const readout = transportReadout(comparison);
    els.toolReadout.textContent = readout.text;
    if (readout.matches !== null) els.toolReadout.dataset.matches = String(readout.matches);
    if (!comparison.available) {
      viewer.setOverlays([]);
      return;
    }
    const t = comparison.transport;
    viewer.setOverlays([
      { segments: polylinesToSegments([{ points: t.points, normals: t.normals }], offset), color: COLORS.loop },
      { segments: arrowsToSegments(t.arrows, arrow, offset), color: COLORS.transported },
      { segments: arrowsToSegments([{ base: t.start, vec: t.startVec, normal: t.startNormal }], arrow * 2.2, offset * 2), color: COLORS.startVector },
      { segments: arrowsToSegments([{ base: t.start, vec: t.endVec, normal: t.startNormal }], arrow * 2.2, offset * 2), color: COLORS.endVector }
    ]);
  }

  function scheduleIntegration() {
    clearTimeout(integrationTimer);
    els.gbValue.textContent = "…";
    integrationTimer = setTimeout(() => {
      const surface = getSurface(state.surfaceId);
      const { totalK } = totalCurvature(surface, state.params, mesh);
      const summary = gaussBonnetSummary(topologyOf(surface, state.params), totalK, {
        meshEstimate: surface.kind === "implicit"
      });
      els.gbValue.textContent = summary.value;
      els.gbValue.dataset.matches = String(summary.matches);
      els.gbNote.textContent = summary.note;
    }, INTEGRATION_DEBOUNCE_MS);
  }

  function setStatus(text) {
    els.status.textContent = text;
    clearTimeout(setStatus.timer);
    setStatus.timer = setTimeout(() => (els.status.textContent = ""), 3000);
  }

  // ---------- Events ----------

  els.surface.addEventListener("change", () => {
    state = normalizeState({
      ...defaultState(els.surface.value),
      colorMode: state.colorMode,
      wireframe: state.wireframe,
      tool: state.tool,
      toolParams: state.toolParams
    });
    renderParamControls();
    syncControls();
    schedule({ geometry: true, frame: true });
  });

  els.tool.addEventListener("change", () => {
    state = normalizeState({ ...state, tool: els.tool.value });
    renderToolControls();
    schedule({ overlays: true });
  });

  els.colorMode.addEventListener("change", () => {
    state = normalizeState({ ...state, colorMode: els.colorMode.value });
    schedule({ colors: true });
  });

  els.wireframe.addEventListener("change", () => {
    state = normalizeState({ ...state, wireframe: els.wireframe.checked });
    schedule({});
  });

  els.autorotate.addEventListener("change", () => viewer.setAutoRotate(els.autorotate.checked));

  els.resetView.addEventListener("click", () => viewer.frame());

  els.resetParams.addEventListener("click", () => {
    state = normalizeState({ ...state, params: {} });
    syncControls();
    schedule({ geometry: true });
  });

  els.copyLink.addEventListener("click", async () => {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied — it reopens this exact surface and parameters.");
    } catch {
      setStatus(`Copy this link: ${url}`);
    }
  });

  // Manual URL edits or back/forward navigation.
  window.addEventListener("hashchange", () => {
    const next = hashToState(location.hash);
    if (stateToHash(next) === stateToHash(state)) return;
    const surfaceChanged = next.surfaceId !== state.surfaceId;
    const toolChanged = next.tool !== state.tool;
    state = next;
    if (surfaceChanged) renderParamControls();
    if (toolChanged) renderToolControls();
    syncControls();
    schedule({ geometry: true, frame: surfaceChanged, overlays: true });
  });

  // ---------- First render ----------

  renderParamControls();
  renderToolControls();
  syncControls();
  schedule({ geometry: true, frame: true });

  return { getState: () => state, viewer };
}
