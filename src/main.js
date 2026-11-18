/**
 * Bootstrap. Kept dependency-free so that it can always run and explain what went
 * wrong if WebGL is missing or three.js cannot be loaded (offline, blocked CDN).
 * The file:// case is handled by a classic inline script in index.html, because
 * module scripts are never executed there.
 */

function showError(title, detail) {
  const el = document.getElementById("error");
  if (!el) return;
  el.hidden = false;
  el.innerHTML = "";
  const h = document.createElement("strong");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = detail;
  el.append(h, p);
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

async function start() {
  if (!hasWebGL()) {
    showError(
      "WebGL is not available.",
      "Your browser or device does not support WebGL, or it is disabled. Try a recent Chrome, Firefox or Safari with hardware acceleration enabled."
    );
    return;
  }

  let app;
  try {
    app = await import("./app.js");
  } catch (err) {
    console.error(err);
    showError(
      "Could not load the 3D engine.",
      "three.js is loaded from cdn.jsdelivr.net. Check your internet connection or content blockers, then reload."
    );
    return;
  }

  try {
    app.init(document);
  } catch (err) {
    console.error(err);
    showError("Something went wrong while starting the playground.", String(err?.message ?? err));
  }
}

start();
