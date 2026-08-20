// GET /api/scoreboard/podiums?window=week|month|year
//
// The C-level dashboard's "Top 3 in Sales" strip. Deliberately its own endpoint
// rather than more fields on /api/scoreboard: that one is fetched by four roles
// on every period toggle and already runs two full sales aggregations (current
// period plus previous, for the trend arrows). Bolting a third onto it would
// slow every rep's landing page to serve a strip only C-level sees. Keeping it
// separate also lets the dashboard paint its numbers first and fill the podium
// in a moment later.
//
// Only the SALES podium lives here. The training podium is all-time and comes
// from the existing /api/training/leaderboard?scope=overall, which already
// flags the company top three -- see PodiumStrip.tsx.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { requireRole, allowMethods } from "../../../src/lib/auth";
import { getWindowRange, type Window } from "../../../src/lib/acculynx/windows";
import { computeSalesRows } from "../../../src/lib/leaderboard/compute";
import { pickPodium } from "../../../src/lib/leaderboard/contractKing";

// Week, month and year only: these are the three the dashboard toggle offers.
// "day" is a valid Window elsewhere but has no button, so accepting it here
// would create a state no user can reach and no caption describes.
const ALLOWED: ReadonlyArray<Window> = ["week", "month", "year"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  // C-level only, matching the one screen that renders it. Widening this later
  // is a deliberate decision, not an accident: a branch manager's dashboard
  // shows BRANCH-scoped tiles, and a company-wide podium under them would read
  // as the branch's top three.
  if (!requireRole(req, res, "c-level")) return;

  await connectMongo();

  try {
    const requested = String(req.query.window);
    const w = (ALLOWED.includes(requested as Window) ? requested : "month") as Window;

    const rows = await computeSalesRows(getWindowRange(w));

    // Same shape pickPodium expects and /api/leaderboard already builds, so the
    // dashboard strip and the full leaderboard can never disagree about who is
    // ahead: both orderings come from compareStanding inside pickPodium.
    const podium = pickPodium(
      rows.map((m) => ({
        id: m.id,
        name: m.name,
        revenue: m.revenue,
        won: m.won,
        filed: m.filed,
        lead: m.leadsCreated,
        verifiedKnocks: m.verifiedKnocks,
      }))
    ).map((p) => ({
      ...p,
      headshotUrl: rows.find((m) => m.id === p.id)?.headshotUrl || "",
    }));

    return res.status(200).json({ window: w, sales: podium });
  } catch (error) {
    console.error("[scoreboard/podiums] Error:", error);
    return res.status(500).json({ error: "Failed to load podiums" });
  }
}
