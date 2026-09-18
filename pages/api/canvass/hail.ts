// pages/api/canvass/hail.ts
// The hail layer behind the dots (spec B5): radar squares of 1 in or more in
// the map view since a day. The request rules live in src/lib/canvass/query.ts.
//
//   GET /api/canvass/hail?bbox=w,s,e,n&since=YYYY-MM-DD
//   -> { cells: [{ date, lat, lng, inches }], truncated }
//
// The squares were already cleaned of fixed radar false echoes when they were
// put onto houses (hailClutter.ts); the layer shows the loaded squares as they
// are, which is why a rep may see a shaded square with no green house under it.

import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { allowMethods, requireRole } from "../../../src/lib/auth";
import { clientIp, rateLimit } from "../../../src/lib/rateLimit";
import { CanvassHailCellModel } from "../../../src/lib/models/CanvassHailCell";
import { HAIL_CELLS_LIMIT, HAIL_CELLS_PROJECTION, hailCellsFilter, parseHailQuery, toMapHailCells, type HailCellRow } from "../../../src/lib/canvass/query";
import { CANVASS_ROLES } from "./homes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireRole(req, res, CANVASS_ROLES);
  if (!auth) return;

  for (const [key, max] of [
    [`canvass:hail:user:${auth.sub}`, 240],
    [`canvass:hail:ip:${clientIp(req)}`, 600],
  ] as const) {
    const limit = rateLimit(key, max, 60 * 1000);
    if (!limit.ok) {
      res.setHeader("Retry-After", String(limit.retryAfterSec));
      return res.status(429).json({ error: "Too many map requests. Please wait a moment." });
    }
  }

  const parsed = parseHailQuery(req.query as Record<string, unknown>);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  await connectMongo();
  const rows = (await CanvassHailCellModel.find(hailCellsFilter(parsed.query), HAIL_CELLS_PROJECTION)
    .limit(HAIL_CELLS_LIMIT + 1)
    .lean()) as HailCellRow[];
  const truncated = rows.length > HAIL_CELLS_LIMIT;
  return res.status(200).json({ cells: toMapHailCells(truncated ? rows.slice(0, HAIL_CELLS_LIMIT) : rows), truncated });
}
