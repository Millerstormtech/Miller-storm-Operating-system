import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { AiBotModel } from "../../../src/lib/models/AiBot";
import { requireRole, allowMethods } from "../../../src/lib/auth";
import { reindexBot } from "../../../src/lib/rag";

// Admin utility to (re)build the RAG embedding index for the Master AI bots.
//   POST { botId }  -> reindex one bot
//   POST { all: true } -> reindex every active bot (one-time backfill for bots
//                         whose training material predates the RAG index)
// Runs synchronously and reports how many chunks each bot produced.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!requireRole(req, res, "admin")) return;

  await connectMongo();
  const { botId, all } = req.body || {};

  try {
    if (all) {
      const bots = await AiBotModel.find({ isActive: true }, { id: 1 }).lean<any[]>();
      const results: Record<string, number> = {};
      for (const b of bots) {
        const r = await reindexBot(b.id);
        results[b.id] = r.chunks;
      }
      return res.status(200).json({ ok: true, bots: bots.length, results });
    }

    if (!botId) return res.status(400).json({ error: "botId or all required" });
    const r = await reindexBot(botId);
    return res.status(200).json({ ok: true, botId, chunks: r.chunks });
  } catch (e: any) {
    console.error("[RAG] reindex endpoint error:", e?.message || e);
    return res.status(500).json({ error: "Reindex failed", detail: e?.message || String(e) });
  }
}
