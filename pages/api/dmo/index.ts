// GET /api/dmo — the caller's DMO and everyone below them (Jay, 2026-10-02).
// A rep gets only themselves; a Team Lead their team; a Branch Manager their
// branch; Jay and Naaman the company. Rules: src/lib/dmo/.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { loadDmo } from "../../../src/lib/dmo/load";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;
  await connectMongo();

  try {
    const caller: any = await UserModel.findOne({ id: auth.sub }).select("id role name territory").lean();
    if (!caller) return res.status(404).json({ error: "User not found" });

    // Admin "View As", the same rule as /api/dashboard: only an admin may pass
    // ?userId=, and the board is then built for that user's role and scope.
    let viewer: any = caller;
    const requestedId = typeof req.query.userId === "string" ? req.query.userId : "";
    if (requestedId && requestedId !== caller.id && caller.role === "admin") {
      const target = await UserModel.findOne({ id: requestedId }).select("id role name territory").lean();
      if (target) viewer = target;
    }
    if (viewer.role === "marketing" || viewer.role === "admin") {
      return res.status(200).json({ variant: viewer.role, dmo: null });
    }

    const dmo = await loadDmo({ id: viewer.id, role: viewer.role, name: viewer.name, territory: viewer.territory });
    return res.status(200).json({ variant: viewer.role, dmo });
  } catch (err) {
    console.error("[dmo] load failed", err);
    return res.status(500).json({ error: "Could not load the DMO" });
  }
}
