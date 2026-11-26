import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findAddonImports, localizeImportMap, readImportMap, threeVersion, LOCAL_THREE, LOCAL_ADDONS } from "../scripts/lib/import-map.js";
import { createAppServer } from "../scripts/lib/server.js";
import { vendorThree } from "../scripts/lib/vendor.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const indexHtml = await readFile(join(ROOT, "index.html"), "utf8");

test("the import map pins one three.js version for core and add-ons", () => {
  const map = readImportMap(indexHtml);
  const version = threeVersion(map);
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.ok(map.imports["three/addons/"].includes(`three@${version}/`), "add-ons use the same version");
});

test("localizeImportMap points both entries at ./vendor and leaves the rest alone", () => {
  const local = localizeImportMap(indexHtml);
  const map = readImportMap(local);
  assert.equal(map.imports.three, LOCAL_THREE);
  assert.equal(map.imports["three/addons/"], LOCAL_ADDONS);
  assert.equal(local.replace(/<script type="importmap">[\s\S]*?<\/script>/, ""), indexHtml.replace(/<script type="importmap">[\s\S]*?<\/script>/, ""));
});

test("findAddonImports discovers the add-ons the app actually uses", async () => {
  assert.deepEqual(await findAddonImports(join(ROOT, "src")), ["controls/OrbitControls.js"]);
});

async function withServer(root, fn) {
  const server = createAppServer({ root });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "tvp-"));
  await writeFile(join(dir, "index.html"), indexHtml);
  await cp(join(ROOT, "src"), join(dir, "src"), { recursive: true });
  return dir;
}

test("server: CDN import map without vendor/, local import map with it", async () => {
  const dir = await fixture();
  try {
    await withServer(dir, async (base) => {
      const online = await (await fetch(`${base}/`)).text();
      assert.match(online, /cdn\.jsdelivr\.net/);
      await mkdir(join(dir, "vendor/three/build"), { recursive: true });
      await writeFile(join(dir, "vendor/three/build/three.module.js"), "export const REVISION = 'test';");
      const offline = await (await fetch(`${base}/`)).text();
      assert.doesNotMatch(offline, /cdn\.jsdelivr\.net/);
      assert.ok(offline.includes(LOCAL_THREE));
      const mod = await fetch(`${base}/vendor/three/build/three.module.js`);
      assert.equal(mod.status, 200);
      assert.match(mod.headers.get("content-type"), /javascript/);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("server: 404 for missing files, no escaping the project directory", async () => {
  const dir = await fixture();
  try {
    await withServer(dir, async (base) => {
      assert.equal((await fetch(`${base}/nope.js`)).status, 404);
      const escaped = await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`);
      assert.ok([403, 404].includes(escaped.status));
      assert.equal((await fetch(`${base}/src/main.js`)).status, 200);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("vendorThree downloads core + add-ons, falling back to the second mirror", async () => {
  const dir = await fixture();
  const version = threeVersion(readImportMap(indexHtml));
  const body = "export const x = 1;\n" + "// padding\n".repeat(200);
  const requested = [];
  const fakeFetch = async (url) => {
    requested.push(url);
    if (url.includes("jsdelivr") && url.includes("OrbitControls")) return { ok: false, status: 503, text: async () => "" };
    return { ok: true, status: 200, text: async () => body };
  };
  try {
    const result = await vendorThree({ root: dir, fetchImpl: fakeFetch, log: () => {} });
    assert.equal(result.version, version);
    assert.deepEqual(result.files.map((f) => f.path), ["build/three.module.js", "examples/jsm/controls/OrbitControls.js"]);
    assert.match(result.files[1].from, /unpkg\.com/);
    await access(join(dir, "vendor/three/examples/jsm/controls/OrbitControls.js"));
    assert.equal((await readFile(join(dir, "vendor/three/VERSION"), "utf8")).trim(), version);
    assert.ok(requested.every((u) => u.includes(`three@${version}/`)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("vendorThree rejects error pages instead of saving them as modules", async () => {
  const dir = await fixture();
  try {
    const html = async () => ({ ok: true, status: 200, text: async () => "<html>blocked</html>" });
    await assert.rejects(vendorThree({ root: dir, fetchImpl: html, log: () => {} }), /not a JavaScript module/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
