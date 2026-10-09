// GET /api/dmo/status — the one DMO line the Dashboard shows, and where it links.
// Kept tiny on purpose: two lookups, no sales numbers, so the Dashboard does not
// wait on the full DMO board (Youssef, 2026-10-08: two pages, two jobs).
// Jay and Naaman have no DMO of their own; their line just points to the
// company DMO. Wording: dmoLine in src/lib/dmo/view.ts.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { DmoWeeklyModel } from "../../../src/lib/models/DmoWeekly";
import { DmoMonthlyModel } from "../../../src/lib/models/DmoMonthly";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { DMO_ROLES } from "../../../src/lib/dmo/config";
import { dmoClock } from "../../../src/lib/dmo/calendar";
import { dmoLine, formMonthFor, monthlyFormState, weeklyFormState } from "../../../src/lib/dmo/view";
import { dmoRouteForRole } from "../../../src/lib/dmoRoute";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;
  await connectMongo();

  try {
    const user: any = await UserModel.findOne({ id: auth.sub }).select("id role").lean();
    const href = dmoRouteForRole(user?.role);
    if (!user || !href) return res.status(200).json({ line: null });

    if (!(DMO_ROLES as readonly string[]).includes(user.role)) {
      return res.status(200).json({ line: { text: "Company DMO: see who is on track in every branch.", urgent: false, href, action: "Open DMO" } });
    }

    const now = new Date();
    const clock = dmoClock(now);
    const month = formMonthFor(clock, now);
    const [weekly, monthly]: any[] = await Promise.all([
      DmoWeeklyModel.findOne({ userId: user.id, weekOf: clock.nextWeekOf }).select("submittedAt").lean(),
      DmoMonthlyModel.findOne({ userId: user.id, month }).select("submittedAt").lean(),
    ]);
    const line = dmoLine(
      { state: weeklyFormState(clock.weekOf, now, weekly ? new Date(weekly.submittedAt) : null) },
      { state: monthlyFormState(month, now, monthly ? new Date(monthly.submittedAt) : null), month },
      clock
    );
    return res.status(200).json({ line: { ...line, href, action: "Open My DMO" } });
  } catch (err) {
    console.error("[dmo/status] failed", err);
    return res.status(500).json({ error: "Could not load the DMO status" });
  }
}
