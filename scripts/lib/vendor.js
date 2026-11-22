/**
 * Downloads the pinned three.js files into <root>/vendor. The version comes from the
 * import map in index.html, and the list of add-ons from the app's own
 * `three/addons/…` imports. Entry point: scripts/vendor-three.js (`npm run vendor`).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { findAddonImports, readImportMap, threeVersion } from "./import-map.js";

const MIRRORS = [
  (version, path) => `https://cdn.jsdelivr.net/npm/three@${version}/${path}`,
  (version, path) => `https://unpkg.com/three@${version}/${path}`
];

/**
 * @param {{ root: string, fetchImpl?: typeof fetch, log?: (msg: string) => void }} options
 * @returns {Promise<{ version: string, files: { path: string, bytes: number, from: string }[] }>}
 */
export async function vendorThree({ root, fetchImpl = fetch, log = console.log }) {
  const html = await readFile(join(root, "index.html"), "utf8");
  const version = threeVersion(readImportMap(html));
  const addons = await findAddonImports(join(root, "src"));
  const wanted = ["build/three.module.js", ...addons.map((a) => `examples/jsm/${a}`)];

  log(`three.js ${version}: fetching ${wanted.length} file(s)`);
  const files = [];
  for (const path of wanted) {
    const { text, from } = await download(fetchImpl, version, path);
    const target = join(root, "vendor", "three", path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
    files.push({ path, bytes: Buffer.byteLength(text), from });
    log(`  ✓ ${path} (${(Buffer.byteLength(text) / 1024).toFixed(0)} KiB)`);
  }
  await writeFile(join(root, "vendor", "three", "VERSION"), `${version}\n`);
  return { version, files };
}

async function download(fetchImpl, version, path) {
  const errors = [];
  for (const mirror of MIRRORS) {
    const url = mirror(version, path);
    try {
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // A real module is large and contains ES exports; anything else is an error page.
      if (text.length < 1000 || !/\bexport\b/.test(text)) throw new Error("response is not a JavaScript module");
      return { text, from: url };
    } catch (err) {
      errors.push(`${url}: ${err.message}`);
    }
  }
  throw new Error(`Could not download ${path}:\n  ${errors.join("\n  ")}`);
}
