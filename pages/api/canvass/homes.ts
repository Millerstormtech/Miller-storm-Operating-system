// pages/api/canvass/homes.ts
// The dots on the Canvass Map (spec B5): up to 3,000 graded houses in the map
// view, or clusters past that. What a caller may ask for, the filter it becomes
// and the cap all live in src/lib/canvass/query.ts, which is tested; this route
// only does the database calls and the guards.
//
//   GET /api/canvass/homes?bbox=w,s,e,n&colors=&hideKnockedDays=&hailSince=&ownerOnly=
//   -> { asOf, homes: [{ id, lat, lng, color, knocked }] }
//   -> { asOf, tooMany: true, clusters: [{ lat, lng, count, green }] }
//
// Nothing here names a person: the list carries id, position, colour and a
// knocked flag (privacy, spec B8). Logs count, never addresses.

import type { NextApiRequest, NextApiResponse } from "next";
import type { PipelineStage } from "mongoose";
import { connectMongo } from "../../../src/lib/mongodb";
import { allowMethods, requireRole } from "../../../src/lib/auth";
import { clientIp, rateLimit } from "../../../src/lib/rateLimit";
import { CanvassHomeModel } from "../../../src/lib/models/CanvassHome";
import { CanvassDoorModel } from "../../../src/lib/models/CanvassDoor";
import { HOMES_LIMIT, HOMES_PROJECTION, clustersPipeline, homesFilter, parseHomesQuery, toClusters, toMapHomes, type ClusterRow, type HomeRow } from "../../../src/lib/canvass/query";
import { latestKnockDayByHome, type CardDoor } from "../../../src/lib/canvass/card";
import { centralDay } from "../../../src/lib/canvass/dates";

/**
 * Who may use the map right now. Youssef, 17 Sep 2026: admin and C-Level only for
 * the first look; the pilot widens to sales, team leads and branch managers later
 * (spec A2 lists all five, not marketing). Widening is this line plus the three
 * role pages and sidebar entries removed in the same commit.
 */
export const CANVASS_ROLES = ["admin", "c-level"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireRole(req, res, CANVASS_ROLES);
  if (!auth) return;

  // Panning fires a request per move, so the ceilings are generous per person
  // and still stop one client from hammering the database.
  for (const [key, max] of [
    [`canvass:homes:user:${auth.sub}`, 240],
    [`canvass:homes:ip:${clientIp(req)}`, 600],
  ] as const) {
    const limit = rateLimit(key, max, 60 * 1000);
    if (!limit.ok) {
      res.setHeader("Retry-After", String(limit.retryAfterSec));
      return res.status(429).json({ error: "Too many map requests. Please wait a moment." });
    }
  }

  const parsed = parseHomesQuery(req.query as Record<string, unknown>);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const { query } = parsed;
  const asOf = centralDay(new Date()) ?? "";

  await connectMongo();
  const rows = (await CanvassHomeModel.find(homesFilter(query), HOMES_PROJECTION)
    .limit(HOMES_LIMIT + 1)
    .lean()) as HomeRow[];

  if (rows.length > HOMES_LIMIT) {
    // query.ts stays free of Mongoose types, so the plain stages are typed here, at the one call.
    const cells = (await CanvassHomeModel.aggregate(clustersPipeline(query) as unknown as PipelineStage[])) as ClusterRow[];
    return res.status(200).json({ asOf, tooMany: true, clusters: toClusters(cells, query.bbox) });
  }

  const doors = (await CanvassDoorModel.find(
    { homeId: { $in: rows.map((row) => row._id) } },
    { homeId: 1, status: 1, statusAt: 1, knocks: 1, statusChanges: 1 }
  ).lean()) as CardDoor[];

  // The knocked-recently filter runs after the cap, so a busy street can show fewer than 3,000 dots; that is fine.
  const homes = toMapHomes(rows, latestKnockDayByHome(doors), asOf, query.hideKnockedDays);
  return res.status(200).json({ asOf, homes });
}
