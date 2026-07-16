import mongoose from 'mongoose';

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

// Auto-add a user to the StormChat group chat for their branch.
//
// The branch group is identified WITHOUT relying on a naming convention:
//   1. Fast path — a group whose name matches the user's territory exactly
//      (case-insensitive).
//   2. Otherwise — the group whose CURRENT members are mostly from that same
//      territory. Since each branch group was populated with that branch's
//      users, the group with the most same-territory members IS that branch's
//      group. This keeps working even if the groups are named arbitrarily.
//
// Uses the native driver (like the DM endpoint) so it never trips over a
// mongoose model that a long-running dev server compiled from an older schema.
// Best-effort: any failure is logged and swallowed so it never blocks the
// user-creation request.
export async function addUserToBranchGroup(userMongoId: string, territory?: string | null): Promise<void> {
  try {
    const t = norm(territory);
    const uid = String(userMongoId || '');
    if (!t || !uid) return;

    const db = mongoose.connection.db;
    if (!db) return;
    const groupsCol = db.collection('chatgroups');
    const usersCol = db.collection('users');

    const groups = await groupsCol
      .find({ isDirect: { $ne: true } }, { projection: { name: 1, members: 1 } })
      .toArray();
    if (groups.length === 0) return;

    // 1. Exact name match.
    let match = groups.find((g) => norm(g.name) === t);

    // 2. Fall back to the group with the most members sharing this territory.
    if (!match) {
      let best: any = null;
      let bestCount = 0;
      for (const g of groups) {
        const ids = (g.members || []).map(String);
        if (ids.length === 0) continue;
        const objIds = ids
          .filter((x: string) => /^[a-f0-9]{24}$/i.test(x))
          .map((x: string) => new mongoose.Types.ObjectId(x));
        const members = await usersCol
          .find({ $or: [{ _id: { $in: objIds } }, { id: { $in: ids } }] }, { projection: { territory: 1 } })
          .toArray();
        const count = members.filter((mm: any) => norm(mm.territory) === t).length;
        if (count > bestCount) {
          bestCount = count;
          best = g;
        }
      }
      if (best && bestCount > 0) match = best;
    }

    if (!match) return;
    if ((match.members || []).map(String).includes(uid)) return; // already a member

    await groupsCol.updateOne({ _id: match._id }, { $addToSet: { members: uid } });
    console.log(`[branch-group] Added user ${uid} to branch group "${match.name}" (territory: ${territory})`);
  } catch (e) {
    console.error('[branch-group] auto-add failed:', e);
  }
}
