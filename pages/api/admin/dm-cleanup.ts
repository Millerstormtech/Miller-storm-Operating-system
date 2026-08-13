import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import mongoose from 'mongoose';
import { requireRole } from '../../../src/lib/auth';

// Cleanup for DMs that were polluted with extra members (the branchGroup
// auto-add bug). A DM's authoritative membership is the two ids in its dmKey.
//
//   GET /api/admin/dm-cleanup          -> DRY RUN (no writes) — review this first
//   GET /api/admin/dm-cleanup?apply=1  -> actually restores members = dmKey pair
//
// Super-admin only. Never touches groups (only threads with a valid 2-id dmKey).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = requireRole(req, res, ['admin']);
  if (!auth) return;
  await connectMongo();
  const db = mongoose.connection.db!;
  const col = db.collection('chatgroups');
  const usersCol = db.collection('users');

  const apply = req.query.apply === '1';

  // Every thread that has a dmKey (i.e. is intended to be a 1-on-1 DM).
  const dmThreads = await col.find({ dmKey: { $exists: true, $ne: '' } }).toArray();

  // Name lookup for readability.
  const allIds = [...new Set(dmThreads.flatMap((t: any) =>
    [...(t.members || []).map(String), ...String(t.dmKey || '').split('__')]
  ))].filter(Boolean);
  const objIds = allIds.filter((s) => /^[a-f0-9]{24}$/i.test(s)).map((s) => new mongoose.Types.ObjectId(s));
  const userDocs = await usersCol
    .find({ $or: [{ _id: { $in: objIds } }, { id: { $in: allIds } }] }, { projection: { _id: 1, id: 1, name: 1, email: 1 } })
    .toArray();
  const nameOf = (id: string) => {
    const u = userDocs.find((d: any) => String(d._id) === String(id) || d.id === id);
    return u ? `${u.name} <${u.email}>` : String(id);
  };

  const polluted: any[] = [];
  for (const t of dmThreads) {
    const dmPair = String(t.dmKey).split('__').filter(Boolean);
    const current = (t.members || []).map(String);
    // Pollution = current members are not exactly the dmKey pair.
    const currentSet = new Set(current);
    const pairSet = new Set(dmPair);
    const extras = current.filter((m: string) => !pairSet.has(m));
    const missing = dmPair.filter((m: string) => !currentSet.has(m));
    const isClean = dmPair.length === 2 && extras.length === 0 && missing.length === 0;
    if (isClean) continue;
    // Only fix when the dmKey is a valid 2-participant key — otherwise leave it
    // for manual review (report only, never auto-mutate an ambiguous thread).
    const fixable = dmPair.length === 2;
    polluted.push({
      groupId: String(t._id),
      name: t.name,
      isDirect: !!t.isDirect,
      dmKey: t.dmKey,
      expectedMembers: dmPair.map(nameOf),
      currentMembers: current.map(nameOf),
      willRemove: extras.map(nameOf),
      willAddBack: missing.map(nameOf),
      fixable,
      applied: false as boolean,
    });
  }

  if (apply) {
    for (const p of polluted) {
      if (!p.fixable) continue;
      const dmPair = String(p.dmKey).split('__').filter(Boolean);
      await col.updateOne(
        { _id: new mongoose.Types.ObjectId(p.groupId) },
        { $set: { members: dmPair, isDirect: true } }
      );
      p.applied = true;
    }
  }

  res.status(200).json({
    mode: apply ? 'APPLIED (production data mutated)' : 'DRY RUN (no writes)',
    dmsScanned: dmThreads.length,
    pollutedDmsFound: polluted.length,
    fixable: polluted.filter((p) => p.fixable).length,
    needsManualReview: polluted.filter((p) => !p.fixable).length,
    details: polluted,
  });
}
