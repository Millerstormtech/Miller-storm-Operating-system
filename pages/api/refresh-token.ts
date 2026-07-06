import type { NextApiRequest, NextApiResponse } from "next";
import { allowMethods, getAuthUser, signSession } from "../../src/lib/auth";

/**
 * Sliding-session refresh. The mobile app calls this with its current (still
 * valid) `Authorization: Bearer <token>` before the token nears expiry, and
 * gets back a freshly signed 7-day token. This keeps long-lived app sessions
 * alive without forcing the user to log in again every week.
 *
 * If the presented token is missing/expired/invalid, we return 401 and the
 * app falls back to a normal login.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!allowMethods(req, res, ["POST"])) return;

  const auth = getAuthUser(req);
  if (!auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = signSession({ id: auth.sub, role: auth.role });
  res.status(200).json({ token });
}
