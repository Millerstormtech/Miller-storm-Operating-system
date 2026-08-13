import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import mongoose from 'mongoose';
import { requireRole } from '../../../src/lib/auth';
import { isDmGroup } from '../../../src/lib/stormchat/isDm';
import { canSeeGroupInList, canReadMessages, canSendMessage, dmParticipants } from '../../../src/lib/stormchat/access';

// READ-ONLY diagnostic (super-admin only). Answers, from the REAL data, exactly
// why a conversation shows up for someone it shouldn't.
//
//   GET /api/admin/dm-audit?users=carley,ashton,admin
//
// For each named person (matched by name/email substring) it resolves their
// user doc, then finds every thread any of them is a member of, and dumps:
//   - groupId, name, isDirect, dmKey, visibility, createdBy, createdAt, members
//   - who (among the named people) CAN SEE it in their list, and CAN READ it
// so you can see whether Ashton is on the SAME Admin<->Carley thread or a
// SEPARATE Ashton<->Carley thread with the same display name.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = requireRole(req, res, ['admin']);
  if (!auth) return;
  await connectMongo();
  const db = mongoose.connection.db!;

  const q = String(req.query.users || '').trim();
  const terms = q ? q.split(',').map((t) => t.trim()).filter(Boolean) : [];
  if (terms.length === 0) {
    return res.status(400).json({ error: 'Pass ?users=carley,ashton,admin' });
  }

  // Resolve each search term to matching user docs.
  const usersCol = db.collection('users');
  const resolved: Array<{ term: string; matches: any[] }> = [];
  for (const term of terms) {
    const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matches = await usersCol
      .find({ $or: [{ name: rx }, { email: rx }, { id: rx }] }, { projection: { _id: 1, id: 1, name: 1, email: 1, role: 1 } })
      .limit(10)
      .toArray();
    resolved.push({ term, matches });
  }

  // The viewer id-set the groups API builds for a user: [appId, _id].
  const idSetFor = (u: any) => [u.id, String(u._id)].filter(Boolean);
  const allUsers = resolved.flatMap((r) => r.matches);
  const memberIds = new Set(allUsers.map((u) => String(u._id)));

  // Every thread any matched user is a member of.
  const threads = await db.collection('chatgroups')
    .find({ members: { $in: [...memberIds] } })
    .toArray();

  // Name lookup for member ids so the dump is readable.
  const nameById = new Map<string, string>();
  const allMemberIds = [...new Set(threads.flatMap((t: any) => (t.members || []).map(String)))];
  const memberDocs = await usersCol
    .find({ _id: { $in: allMemberIds.map((s) => { try { return new mongoose.Types.ObjectId(s); } catch { return s; } }) } }, { projection: { _id: 1, name: 1, email: 1, role: 1 } })
    .toArray();
  memberDocs.forEach((u: any) => nameById.set(String(u._id), `${u.name} <${u.email}> [${u.role}]`));

  const report = threads.map((t: any) => {
    const canonical = dmParticipants(t); // canonical DM participants (or null for a group)
    return {
      groupId: String(t._id),
      name: t.name,
      isDirect: !!t.isDirect,
      dmKey: t.dmKey || null,
      visibility: t.visibility ?? '(none)',
      detectedAsDm: isDmGroup(t),
      createdBy: t.createdBy ? (nameById.get(String(t.createdBy)) || String(t.createdBy)) : null,
      createdAt: t.createdAt,
      memberCount: (t.members || []).length,
      // Raw (possibly polluted) members vs the canonical DM participants.
      members: (t.members || []).map((m: string) => nameById.get(String(m)) || String(m)),
      canonicalParticipants: canonical ? canonical.map((m) => nameById.get(String(m)) || String(m)) : null,
      polluted: !!canonical && (t.members || []).map(String).some((m: string) => !canonical.includes(String(m))),
      // Per named person: exactly who can see / read / send, and whether they are
      // a raw member vs a real canonical participant.
      access: allUsers.map((u) => ({
        who: `${u.name} [${u.role}]`,
        isMember: (t.members || []).map(String).includes(String(u._id)),
        isCanonicalParticipant: !!canonical && canonical.map(String).includes(String(u._id)),
        canSeeInList: canSeeGroupInList(t, idSetFor(u)),
        canRead: canReadMessages(t, idSetFor(u), u.role),
        canSend: canSendMessage(t, idSetFor(u), u.role),
      })),
    };
  });

  res.status(200).json({
    resolvedUsers: resolved.map((r) => ({
      term: r.term,
      matches: r.matches.map((u) => ({ _id: String(u._id), id: u.id, name: u.name, email: u.email, role: u.role })),
    })),
    threadCount: report.length,
    threads: report,
  });
}
