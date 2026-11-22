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
import { defaultState, hashToState, normalizeState, stateToHash } from "./state.js";
import { createViewer } from "./render/viewer.js";
import {
  formatNumber,
  gaussBonnetSummary,
  invariantRows,
  meshCountSummary,
  stepDecimals,
  topologyFacts
} from "./ui/format.js";

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

  function renderParamControls() {
    const surface = getSurface(state.surfaceId);
    els.params.querySelectorAll(".param").forEach((n) => n.remove());

    for (const spec of surface.params) {
      const id = `param-${spec.id}`;
      const wrap = doc.createElement("div");
      wrap.className = "param";

      const label = doc.createElement("label");
      label.htmlFor = id;
      label.textContent = spec.label;

      const row = doc.createElement("div");
      row.className = "slider-row";

      const input = doc.createElement("input");
      Object.assign(input, { type: "range", id, min: spec.min, max: spec.max, step: spec.step });
      input.value = String(state.params[spec.id]);
      input.dataset.param = spec.id;

      const output = doc.createElement("output");
      output.htmlFor = id;
      output.textContent = Number(input.value).toFixed(stepDecimals(spec.step));

      input.addEventListener("input", () => {
        state = normalizeState({ ...state, params: { ...state.params, [spec.id]: Number(input.value) } });
        output.textContent = state.params[spec.id].toFixed(stepDecimals(spec.step));
        schedule({ geometry: true });
      });

      row.append(input, output);
      wrap.append(label, row);
      els.params.append(wrap);
    }
  }

  function syncControls() {
    const surface = getSurface(state.surfaceId);
    els.surface.value = state.surfaceId;
    els.surfaceDescription.textContent = surface.description;
    els.colorMode.value = state.colorMode;
    els.wireframe.checked = state.wireframe;

    for (const input of els.params.querySelectorAll("input[data-param]")) {
      const spec = surface.params.find((p) => p.id === input.dataset.param);
      input.value = String(state.params[spec.id]);
      input.nextElementSibling.textContent = state.params[spec.id].toFixed(stepDecimals(spec.step));
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

  const pending = { geometry: false, colors: false, frame: false };
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
    }
    if (pending.colors) applyColors();
    if (pending.frame) viewer.frame();
    viewer.setWireframe(state.wireframe);

    pending.geometry = pending.colors = pending.frame = false;
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
    state = defaultState(els.surface.value);
    state.colorMode = els.colorMode.value;
    state.wireframe = els.wireframe.checked;
    state = normalizeState(state);
    renderParamControls();
    syncControls();
    schedule({ geometry: true, frame: true });
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
    state = next;
    if (surfaceChanged) renderParamControls();
    syncControls();
    schedule({ geometry: true, frame: surfaceChanged });
  });

  // ---------- First render ----------

  renderParamControls();
  syncControls();
  schedule({ geometry: true, frame: true });

  return { getState: () => state, viewer };
}
