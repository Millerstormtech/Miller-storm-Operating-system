import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser, allowMethods } from "../../src/lib/auth";

// GET /api/session-check: 200 when the caller's login is still good (valid
// token AND the account isn't deleted / suspended / awaiting deletion, see
// src/lib/accountStatus.ts), 401 otherwise. Used by upload-server.js, which
// can verify a token's signature but can't see the account's state.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireUser(req, res)) return;
  res.status(200).json({ ok: true });
}
