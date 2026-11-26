#!/usr/bin/env node
/**
 * `npm run vendor`: downloads the pinned three.js files into ./vendor so the playground
 * works offline. `npm start` uses the local copy whenever it exists; GitHub Pages keeps
 * using the CDN (vendor/ is not committed).
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { vendorThree } from "./lib/vendor.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

try {
  await vendorThree({ root });
  console.log("Done. `npm start` will now serve three.js from vendor/ (offline mode).");
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
