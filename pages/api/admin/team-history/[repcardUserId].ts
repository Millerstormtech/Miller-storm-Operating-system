// GET/POST /api/admin/team-history/:repcardUserId: one rep's timeline; preview
// and save a date fix or an earlier move; undo. Admins only. Every save is
// version-checked, so neither an admin nor the hourly step overwrites the other.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../../src/lib/mongodb";
import { requireRole, allowMethods } from "../../../../src/lib/auth";
import { RepTeamHistoryModel } from "../../../../src/lib/models/RepTeamHistory";
import { TeamHistoryEditModel } from "../../../../src/lib/models/TeamHistoryEdit";
import { moveBoundary, addPastMove, validateHistory, samePeriods, HistoryEditError, HISTORY_START, type Period } from "../../../../src/lib/teamhistory/periods";
import { splitIntoSegments } from "../../../../src/lib/teamhistory/segments";
import { loadDailyTotals } from "../../../../src/lib/teamhistory/daily";
import { loadSharedRosterData } from "../../../../src/lib/leaderboard/compute";
import { matchAcxToRc } from "../../../../src/lib/leaderboard/merge";
import { centralDateStr } from "../../../../src/lib/acculynx/windows";
import { normEmail, normPhone, normName } from "../../../../src/lib/leaderboard/identity";

// Which AccuLynx ids merge into this rep. Matched against this ONE rep, so an
// identity shared with someone else would match here though the board treats it
// as ambiguous: acceptable for a preview; the save does not depend on it.
async function acxIdsFor(repcardUserId: string): Promise<string[]> {
  const shared = await loadSharedRosterData();
  const u = shared.rcById.get(repcardUserId);
  if (!u) return [];
  const rc = [{ repcardUserId, email: normEmail(u.email), phone: normPhone(u.phone), nameKey: normName(u.name), name: u.name || "", branch: "", verifiedKnocks: 0 }];
  return [...matchAcxToRc(shared.acxAll, rc).keys()];
}

async function shifts(repcardUserId: string, before: Period[], after: Period[], today: string) {
  const range = { from: HISTORY_START, to: today };
  const daily = (await loadDailyTotals({
    rcIds: [repcardUserId],
    acxIdsByRc: new Map([[repcardUserId, await acxIdsFor(repcardUserId)]]),
    start: new Date(`${HISTORY_START}T00:00:00-06:00`),
    end: new Date(),
  })).get(repcardUserId) || [];
  const byTeam = (periods: Period[]) => {
    const m = new Map<string, { revenue: number; won: number; filed: number; verifiedKnocks: number }>();
    for (const s of splitIntoSegments(daily, periods, range, { team: "", branch: "" })) {
      const t = m.get(s.team) || { revenue: 0, won: 0, filed: 0, verifiedKnocks: 0 };
      t.revenue += s.revenue; t.won += s.won; t.filed += s.filed; t.verifiedKnocks += s.verifiedKnocks;
      m.set(s.team, t);
    }
    return m;
  };
  const a = byTeam(before), b = byTeam(after);
  const zero = { revenue: 0, won: 0, filed: 0, verifiedKnocks: 0 };
  const delta = [...new Set([...a.keys(), ...b.keys()])].map((team) => {
    const x = a.get(team) || zero, y = b.get(team) || zero;
    return { team, revenue: y.revenue - x.revenue, won: y.won - x.won, filed: y.filed - x.filed, verifiedKnocks: y.verifiedKnocks - x.verifiedKnocks };
  });
  const gainer = delta.find((d) => d.revenue > 0 || d.won > 0 || d.filed > 0 || d.verifiedKnocks > 0)?.team ?? "";
  return delta
    .filter((d) => d.revenue < 0 || d.won < 0 || d.filed < 0 || d.verifiedKnocks < 0)
    .map((l) => ({ from: l.team, to: gainer, revenue: -l.revenue, won: -l.won, filed: -l.filed, verifiedKnocks: -l.verifiedKnocks }));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  const auth = requireRole(req, res, ["admin"]);
  if (!auth) return;
  await connectMongo();

  const id = String(req.query.repcardUserId || "");
  const doc: any = await RepTeamHistoryModel.findOne({ repcardUserId: id }).lean();
  if (!doc) return res.status(404).json({ error: "not-found" });
  const today = centralDateStr(new Date());

  if (req.method === "GET") {
    const edits = await TeamHistoryEditModel.find({ repcardUserId: id }).sort({ createdAt: -1 }).limit(50).lean();
    return res.status(200).json({
      repcardUserId: id, repName: doc.repName, version: doc.version, periods: doc.periods,
      edits: (edits as any[]).map((e) => ({ id: String(e._id), action: e.action, reason: e.reason, byUserId: e.byUserId, createdAt: e.createdAt, undone: !!e.undoneBy })),
    });
  }

  const body = (req.body || {}) as any;
  const before: Period[] = doc.periods || [];

  if (body.op === "undo") {
    const edit: any = await TeamHistoryEditModel.findOne({ _id: body.editId, repcardUserId: id }).lean();
    if (!edit || edit.undoneBy || edit.action === "undo") return res.status(400).json({ error: "not-undoable" });
    if (!samePeriods(before, edit.after)) return res.status(409).json({ error: "changed", message: "This rep's history changed after that edit. Undo the later changes first." });
    const r = await RepTeamHistoryModel.updateOne({ repcardUserId: id, version: doc.version }, { $set: { periods: edit.before }, $inc: { version: 1 } });
    if (r.modifiedCount !== 1) return res.status(409).json({ error: "changed" });
    const undo = await TeamHistoryEditModel.create({ repcardUserId: id, action: "undo", before, after: edit.before, reason: `Undo of ${edit.action}`, byUserId: auth.sub });
    await TeamHistoryEditModel.updateOne({ _id: edit._id }, { $set: { undoneBy: String(undo._id) } });
    return res.status(200).json({ ok: true, version: doc.version + 1 });
  }

  if (body.op !== "preview" && body.op !== "save") return res.status(400).json({ error: "bad-op" });
  if (Number(body.version) !== Number(doc.version)) return res.status(409).json({ error: "changed", message: "This rep's history changed. Reload and try again." });
  const date = String(body.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "bad-date" });

  let after: Period[];
  try {
    if (body.action === "move-date") after = moveBoundary(before, Number(body.index), date, today);
    else if (body.action === "add-move") {
      const team = String(body.earlierTeam || "");
      if (!team) return res.status(400).json({ error: "bad-team" });
      after = addPastMove(before, date, { team, branch: String(body.earlierBranch || "") }, today);
    } else return res.status(400).json({ error: "bad-action" });
  } catch (e) {
    if (e instanceof HistoryEditError) return res.status(400).json({ error: e.code, message: e.message });
    throw e;
  }
  const invalid = validateHistory(after);
  if (invalid) return res.status(400).json({ error: invalid });

  if (body.op === "preview") return res.status(200).json({ shifts: await shifts(id, before, after, today) });

  const reason = String(body.reason || "").trim();
  if (!reason) return res.status(400).json({ error: "reason-required", message: "Say why you are changing this." });
  const r = await RepTeamHistoryModel.updateOne({ repcardUserId: id, version: doc.version }, { $set: { periods: after }, $inc: { version: 1 } });
  if (r.modifiedCount !== 1) return res.status(409).json({ error: "changed" });
  await TeamHistoryEditModel.create({ repcardUserId: id, action: body.action, before, after, reason, byUserId: auth.sub });
  return res.status(200).json({ ok: true, version: doc.version + 1 });
}
