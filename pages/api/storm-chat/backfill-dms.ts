import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import { connectMongo } from '../../../src/lib/mongodb';
import { requireRole, allowMethods } from '../../../src/lib/auth';

// One-time admin fix: mark legacy DM documents — 2-member "Direct Message"
// threads created before the isDirect/dmKey fields existed — as real DMs, so
// they become members-only everywhere. Idempotent; safe to run repeatedly.
// POST /api/storm-chat/backfill-dms  (admin only)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = requireRole(req, res, ['admin']);
  if (!auth) return;

  await connectMongo();
  const col = mongoose.connection.db!.collection('chatgroups');

  // Every legacy 1-on-1 thread: exactly 2 members and no group `visibility`
  // (real groups always carry one; DMs never do). This catches DMs that were
  // named something other than "Direct Message" too, so they all get the
  // isDirect/dmKey flags and are treated as private everywhere.
  const legacy = await col
    .find({ isDirect: { $ne: true }, members: { $size: 2 }, visibility: { $exists: false } })
    .toArray();

  let fixed = 0;
  for (const g of legacy) {
    const members = (g.members || []).map((m: any) => String(m));
    const dmKey = g.dmKey || members.slice().sort().join('__');
    await col.updateOne({ _id: g._id }, { $set: { isDirect: true, dmKey } });
    fixed++;
  }

  res.status(200).json({ scanned: legacy.length, fixed });
}
