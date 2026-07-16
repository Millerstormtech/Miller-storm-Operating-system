import mongoose from 'mongoose';

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

// Auto-add a user to the StormChat group chat(s) for their branch(es).
//
// A user can belong to more than one branch, so this adds them to EACH branch's
// group. Each branch group is identified WITHOUT relying on a naming convention:
//   1. Fast path — a group whose name matches the branch exactly
//      (case-insensitive).
//   2. Otherwise — the group whose CURRENT members are mostly from that same
//      branch. Since each branch group was populated with that branch's users,
//      the group with the most same-branch members IS that branch's group. This
//      keeps working even if the groups are named arbitrarily.
//
// A member counts toward a branch if their `territory` OR any of their
// `branches` equals it. Uses the native driver (like the DM endpoint) so it
// never trips over a stale mongoose model. Best-effort: failures are logged and
// swallowed so it never blocks the user-creation request.
export async function addUserToBranchGroups(userMongoId: string, branches: Array<string | null | undefined>): Promise<void> {
  try {
    const uid = String(userMongoId || '');
    if (!uid) return;
    const wanted = Array.from(new Set(branches.map(norm).filter(Boolean)));
    if (wanted.length === 0) return;

    const db = mongoose.connection.db;
    if (!db) return;
    const groupsCol = db.collection('chatgroups');
    const usersCol = db.collection('users');

    const groups = await groupsCol
      .find({ isDirect: { $ne: true } }, { projection: { name: 1, members: 1 } })
      .toArray();
    if (groups.length === 0) return;

    // Cache each group's members' branch info so multi-branch users don't refetch.
    const memberBranchCache = new Map<string, string[][]>(); // groupId -> array of each member's [territory + branches] normalized

    async function memberBranchesOf(g: any): Promise<string[][]> {
      const key = String(g._id);
      if (memberBranchCache.has(key)) return memberBranchCache.get(key)!;
      const ids = (g.members || []).map(String);
      let result: string[][] = [];
      if (ids.length > 0) {
        const objIds = ids
          .filter((x: string) => /^[a-f0-9]{24}$/i.test(x))
          .map((x: string) => new mongoose.Types.ObjectId(x));
        const members = await usersCol
          .find({ $or: [{ _id: { $in: objIds } }, { id: { $in: ids } }] }, { projection: { territory: 1, branches: 1 } })
          .toArray();
        result = members.map((mm: any) => [norm(mm.territory), ...((mm.branches || []).map(norm))].filter(Boolean));
      }
      memberBranchCache.set(key, result);
      return result;
    }

    for (const branch of wanted) {
      // 1. Exact name match.
      let match = groups.find((g) => norm(g.name) === branch);

      // 2. Fall back to the group whose members mostly belong to this branch.
      if (!match) {
        let best: any = null;
        let bestCount = 0;
        for (const g of groups) {
          const memberBranches = await memberBranchesOf(g);
          const count = memberBranches.filter((bl) => bl.includes(branch)).length;
          if (count > bestCount) {
            bestCount = count;
            best = g;
          }
        }
        if (best && bestCount > 0) match = best;
      }

      if (!match) continue;
      if ((match.members || []).map(String).includes(uid)) continue; // already a member

      await groupsCol.updateOne({ _id: match._id }, { $addToSet: { members: uid } });
      console.log(`[branch-group] Added user ${uid} to branch group "${match.name}" (branch: ${branch})`);
    }
  } catch (e) {
    console.error('[branch-group] auto-add failed:', e);
  }
}
