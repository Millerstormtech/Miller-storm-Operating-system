import type { NextApiRequest, NextApiResponse } from "next";
import { CATEGORY_DISPLAY_ORDER } from "../../../src/lib/training/categories";

// The Training Center category SECTION order, so the mobile app can render course
// categories in the same order as the web without hard-coding the list. This is
// the single source of truth (src/lib/training/categories.ts); the app falls
// back to a bundled copy if this call fails. Deduped, order preserved.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }

  const order = Array.from(new Set(CATEGORY_DISPLAY_ORDER.filter(Boolean)));
  // Cache at the edge for a minute — the list is a code constant, not per-user.
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
  res.status(200).json({ order });
}
