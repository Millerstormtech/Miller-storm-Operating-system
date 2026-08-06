import mongoose from 'mongoose';

// StormChat groups can be PUBLIC (every account is a member) or PRIVATE (members
// managed manually). These helpers keep public-group membership in sync:
//   - when a group becomes public, every existing account is added, and
//   - when a new account is created, it's added to every public group.
//
// Native driver (like the DM/branch-group helpers) so it never trips over a
// stale mongoose model. Members store Mongo _id strings. Best-effort: failures
// are logged and swallowed so they never block the caller.

/** Add every non-deleted user to one group's members AND to every subgroup nested
 *  under it (used when a group is set public — its subgroups belong to the same
 *  people). */
export async function addAllUsersToGroup(groupId: string | mongoose.Types.ObjectId): Promise<void> {
  try {
    const db = mongoose.connection.db;
    if (!db) return;
    const _id = typeof groupId === 'string' ? new mongoose.Types.ObjectId(groupId) : groupId;
    const users = await db.collection('users').find({ deleted: { $ne: true } }, { projection: { _id: 1 } }).toArray();
    const ids = users.map((u: any) => String(u._id));
    if (ids.length === 0) return;
    // The group itself, plus any subgroup whose parentGroupId is this group's id
    // (parentGroupId is stored as the parent's _id string).
    const res = await db.collection('chatgroups').updateMany(
      { $or: [{ _id }, { parentGroupId: String(_id) }] },
      { $addToSet: { members: { $each: ids } } }
    );
    console.log(`[public-groups] Added ${ids.length} users to public group ${_id} (+${((res as any).modifiedCount ?? 1) - 1} subgroup(s))`);
  } catch (e) {
    console.error('[public-groups] addAllUsersToGroup failed:', e);
  }
}

/** Add one user (by Mongo _id) to every PUBLIC group AND every subgroup nested
 *  under a public group (used when an account is created). Subgroups may not
 *  carry their own visibility flag, so they are matched by parentGroupId. */
export async function addUserToPublicGroups(userMongoId: string): Promise<void> {
  try {
    const uid = String(userMongoId || '');
    if (!uid) return;
    const db = mongoose.connection.db;
    if (!db) return;

    // Every public group's id, so subgroups nested under a public group are
    // caught even when the subgroup itself is not flagged public.
    const publicGroups = await db.collection('chatgroups')
      .find({ visibility: 'public' }, { projection: { _id: 1 } }).toArray();
    const publicIds = publicGroups.map((g: any) => String(g._id));

    const res = await db.collection('chatgroups').updateMany(
      { $or: [{ visibility: 'public' }, { parentGroupId: { $in: publicIds } }] },
      { $addToSet: { members: uid } }
    );
    const n = (res as any).modifiedCount ?? 0;
    if (n) console.log(`[public-groups] Added user ${uid} to ${n} public group(s)/subgroup(s)`);
  } catch (e) {
    console.error('[public-groups] addUserToPublicGroups failed:', e);
  }
}
