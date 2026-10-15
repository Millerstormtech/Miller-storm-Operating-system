// "Leave group" rules (GroupMe model), pure so they can be unit-tested.
//
//  - Only someone listed in the group can leave it.
//  - The LAST group admin must hand the role to another member first, so a
//    group is never left with nobody to run it. If they are the last person
//    in the group, they simply leave.
//  - The leaver is removed from members AND admins and recorded on
//    leftMembers, so a public group's auto-add doesn't pull them back in.
//
// All ids here are the Mongo _id strings groups store; viewerIds may also
// carry the app id (ignored when matching).

export type LeavePlan =
  | { ok: true; members: string[]; admins: string[]; leftMembers: string[] }
  | { ok: false; status: number; error: string; needsNewAdmin?: boolean };

export function leavePlan(group: any, viewerIds: string[], newAdminId?: string): LeavePlan {
  const mine = new Set(viewerIds.map(String));
  const members: string[] = (group?.members || []).map(String);
  const admins: string[] = (group?.admins || []).map(String);
  const listed = members.some((m) => mine.has(m)) || admins.some((a) => mine.has(a));
  if (!listed) return { ok: false, status: 400, error: 'You are not in this group' };

  const remainingMembers = members.filter((m) => !mine.has(m));
  let remainingAdmins = admins.filter((a) => !mine.has(a));
  const iAmAdmin = admins.some((a) => mine.has(a));

  if (iAmAdmin && remainingAdmins.length === 0 && remainingMembers.length > 0) {
    if (!newAdminId) {
      return {
        ok: false, status: 409, needsNewAdmin: true,
        error: 'You are the last admin of this group. Choose a new admin before leaving.',
      };
    }
    if (!remainingMembers.includes(String(newAdminId))) {
      return { ok: false, status: 400, error: 'The new admin must be someone in this group' };
    }
    remainingAdmins = [String(newAdminId)];
  }

  // Record the leaver under the id form the group stored for them.
  const leaverIds = [...members, ...admins].filter((x) => mine.has(x));
  const leftMembers = Array.from(new Set([...(group?.leftMembers || []).map(String), ...leaverIds]));

  return { ok: true, members: remainingMembers, admins: remainingAdmins, leftMembers };
}
