#!/usr/bin/env node
/**
 * Zero-dependency static file server for local development.
 *   npm start            → http://localhost:8000
 *   PORT=3000 npm start  → http://localhost:3000
 *
 * ES modules do not load from file:// URLs, so the page must be served over HTTP.
 * With a local three.js copy (`npm run vendor`) the playground also works offline.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAppServer, hasVendoredThree } from "./lib/server.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT) || 8000;
const offline = await hasVendoredThree(root);

createAppServer({ root }).listen(port, () => {
  console.log(`Topology Visualization Playground → http://localhost:${port}`);
  console.log(
    offline
      ? "three.js: local copy in vendor/ (works offline)"
      : "three.js: CDN (run `npm run vendor` once to work offline)"
  );
});
