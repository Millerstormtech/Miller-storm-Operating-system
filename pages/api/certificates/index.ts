// GET /api/certificates
// Every certificate the signed-in person has earned, newest first, for My
// Profile on the web and the phone (2026-09-13). Only ever the caller's own.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { loadMyCertificates } from "../../../src/lib/certificate/mine";
import { certificateList } from "../../../src/lib/certificate/credential";
import { CREDENTIALS } from "../../../src/lib/training/credentials";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  try {
    await connectMongo();
    const mine = await loadMyCertificates(auth.sub);
    if (!mine) return res.status(404).json({ error: "User not found" });
    const labelFor = (key: string) => CREDENTIALS.find((c) => c.key === key)?.label ?? null;
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      certificates: certificateList(mine.credentialAwards, mine.kingAwards, labelFor),
    });
  } catch (e: any) {
    console.error("[certificates] list failed:", e?.message);
    return res.status(500).json({ error: "Could not load certificates" });
  }
}
