/**
 * Helpers around the import map in index.html — the single place where the three.js
 * version is pinned. Used by the dev server (to switch to a local copy) and by
 * scripts/vendor-three.js (to know what to download).
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const IMPORT_MAP_RE = /<script type="importmap">([\s\S]*?)<\/script>/;

/** Local paths, relative to the site root, that mirror the CDN layout. */
export const LOCAL_THREE = "./vendor/three/build/three.module.js";
export const LOCAL_ADDONS = "./vendor/three/examples/jsm/";

/**
 * @param {string} html
 * @returns {{ imports: Record<string, string> }}
 */
export function readImportMap(html) {
  const m = IMPORT_MAP_RE.exec(html);
  if (!m) throw new Error("index.html has no <script type=\"importmap\">");
  return JSON.parse(m[1]);
}

/** "0.161.0" from ".../three@0.161.0/...". */
export function threeVersion(importMap) {
  const m = /three@([\w.-]+)\//.exec(importMap.imports.three ?? "");
  if (!m) throw new Error("Could not read the three.js version from the import map");
  return m[1];
}

/**
 * Returns the HTML with the import map pointing at ./vendor instead of the CDN.
 * Everything outside the import map is left untouched.
 */
export function localizeImportMap(html) {
  const map = readImportMap(html);
  const local = { ...map, imports: { ...map.imports, three: LOCAL_THREE, "three/addons/": LOCAL_ADDONS } };
  const json = JSON.stringify(local, null, 2).replace(/\n/g, "\n    ");
  return html.replace(IMPORT_MAP_RE, `<script type="importmap">\n    ${json}\n  </script>`);
}

/**
 * Finds every "three/addons/…" module imported by the app, so the vendor script knows
 * which add-on files to fetch without a hand-maintained list.
 * @param {string} srcDir
 * @returns {Promise<string[]>} paths relative to examples/jsm/, e.g. "controls/OrbitControls.js"
 */
export async function findAddonImports(srcDir) {
  const found = new Set();
  for (const file of await listJs(srcDir)) {
    const text = await readFile(file, "utf8");
    for (const m of text.matchAll(/from\s+["']three\/addons\/([^"']+)["']/g)) found.add(m[1]);
  }
  return [...found].sort();
}

async function listJs(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listJs(p)));
    else if (entry.name.endsWith(".js")) out.push(p);
  }
  return out;
}
