import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { canAssignTo, scopeFor, type Actor } from "../../../src/lib/tasks/permissions";

// Who may this caller hand work to? The assign form uses this so its people
// picker shows exactly what the server would accept, instead of fetching every
// user in the company the way the old Team Tasks screen did.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  const me = (await UserModel.findOne({ id: auth.sub })
    .select("id role branches")
    .lean()) as any;
  if (!me) { res.status(404).json({ error: "User not found" }); return; }

  const actor: Actor = { id: auth.sub, role: auth.role, branches: me.branches ?? [] };

  // A self-only role has nobody to assign to, so skip the query entirely.
  if (scopeFor(actor).mode === "self") { res.status(200).json([]); return; }

  const candidates = (await UserModel.find({
    deleted: { $ne: true },
    suspended: { $ne: true }
  })
    .select("id name email managerId branches")
    .lean()) as any[];

  const allowed = candidates
    .filter((u) => canAssignTo(actor, { id: u.id, managerId: u.managerId, branches: u.branches }))
    .map((u) => ({ id: u.id, name: u.name, email: u.email }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  res.status(200).json(allowed);
  return;
}
