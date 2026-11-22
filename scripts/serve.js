#!/usr/bin/env node
/**
 * Zero-dependency static file server for local development.
 *   npm start            → http://localhost:8000
 *   PORT=3000 npm start  → http://localhost:3000
 *
 * ES modules do not load from file:// URLs, so the page must be served over HTTP.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT) || 8000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let file = normalize(join(ROOT, urlPath));
    // Refuse anything that escapes the project directory.
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Topology Visualization Playground → http://localhost:${PORT}`);
});
