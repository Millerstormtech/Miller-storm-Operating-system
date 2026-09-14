// POST /api/calendar/disconnect — forgets this person's stored Google tokens.
// Does not revoke the grant on Google's side (the user can do that from their
// Google Account if they want to fully revoke access); this just stops the app
// from using it, and a future Connect re-prompts for consent either way.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, allowMethods } from "../../../src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  try {
    await connectMongo();
    await UserModel.updateOne({ id: auth.sub }, { $unset: { googleCalendar: "" } });
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[calendar/disconnect] failed:", e?.message);
    return res.status(500).json({ error: "Could not disconnect" });
  }
}
