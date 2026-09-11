import type { NextApiRequest, NextApiResponse } from "next";
import { allowMethods, getAuthUser, signSession } from "../../src/lib/auth";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";

/**
 * Sliding-session refresh. The mobile app calls this with its current (still
 * valid) `Authorization: Bearer <token>` on every launch/resume, and gets back
 * a freshly signed token, so an active user's 1-year clock keeps resetting and
 * they never hit an expired token.
 *
 * This is also the session kill-switch. Tokens are self-contained and long
 * lived, so the ONLY moment the server gets to reconsider whether an account is
 * still allowed in is here, at refresh. We look the user up and refuse to
 * reissue for an account that has since been deleted, suspended, or has a
 * pending deletion request. The mobile client treats a 401 from refresh as a
 * real logout (api_client.dart), so a fired or suspended rep is signed out on
 * their next app launch instead of keeping a working token for up to a year.
 * We also re-mint from the CURRENT role in the database, so a demotion or
 * promotion takes effect on refresh rather than only on a fresh login.
 *
 * If the presented token is missing/expired/invalid, we return 401 and the app
 * falls back to a normal login.
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

  await connectMongo();
  const user = (await UserModel.findOne({ id: auth.sub })
    .select("id role deleted suspended deletionRequested")
    .lean()) as
    | { id: string; role: string; deleted?: boolean; suspended?: boolean; deletionRequested?: boolean }
    | null;

  if (!user || user.deleted || user.suspended || user.deletionRequested) {
    // Account is gone or blocked — do not renew. Next launch logs them out.
    res.status(401).json({ error: "Session no longer valid" });
    return;
  }

  const token = signSession({ id: user.id, role: user.role });
  res.status(200).json({ token });
}
