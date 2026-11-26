/**
 * Static file server used by `npm start` (see scripts/serve.js) and by the tests.
 * If `npm run vendor` has been run, index.html is served with its import map pointing
 * at the local three.js copy, so the playground works offline.
 */

import { createServer } from "node:http";
import { access, readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { localizeImportMap } from "./import-map.js";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

/** True when the files the import map needs are present in vendor/. */
export async function hasVendoredThree(root) {
  try {
    await access(join(root, "vendor", "three", "build", "three.module.js"));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{ root: string }} options
 * @returns {import('node:http').Server}
 */
export function createAppServer({ root }) {
  const ROOT = resolve(root);
  return createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      let file = normalize(join(ROOT, urlPath));
      // Refuse anything that escapes the project directory.
      if (file !== ROOT && !file.startsWith(ROOT + sep)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, "index.html");
      let body = await readFile(file);
      if (file === join(ROOT, "index.html") && (await hasVendoredThree(ROOT))) {
        body = localizeImportMap(body.toString("utf8"));
      }
      res.writeHead(200, {
        "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-cache"
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    }
  });
}
