// pages/api/canvass/map-worker/[file].ts
// Serves MapLibre's web worker to the Canvass Map from the installed package.
//
// MapLibre v6 finds its worker with new URL("./maplibre-gl-worker.mjs",
// import.meta.url) inside its own module. Under Next's bundler that address is a
// hashed chunk, the worker file 404s silently, the map's style never finishes
// loading and no tiles are ever drawn (found 17 Sep 2026). The worker also
// imports a sibling file, ./maplibre-gl-shared.mjs, so both must be served side
// by side at fixed addresses. MapCanvas.tsx points MapLibre here.
//
// Public on purpose: this is the library's own published code (BSD-3), the same
// bytes a CDN would serve, and a worker request cannot carry the app's Bearer
// header anyway. Only the two named files can be read; nothing is taken from the
// URL beyond choosing between them.

import type { NextApiRequest, NextApiResponse } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { allowMethods } from "../../../../src/lib/auth";

// A plain path under the app directory, not require.resolve: inside a bundled
// API route that resolves to a bundle id, not a file. PM2 starts the app from the
// app directory, as does next dev, so process.cwd() is the repo root in both.
const DIST = path.join(process.cwd(), "node_modules", "maplibre-gl", "dist");
const FILES = new Set(["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]);

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const raw = req.query.file;
  const name = Array.isArray(raw) ? raw[0] : raw;
  if (!name || !FILES.has(name)) return res.status(404).json({ error: "Not found" });

  let body: Buffer;
  try {
    body = readFileSync(path.join(DIST, name));
  } catch {
    return res.status(500).json({ error: "Map worker file is not installed" });
  }
  res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.status(200).send(body);
}
