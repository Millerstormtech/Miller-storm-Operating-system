// Single source of truth for "who is allowed to see / read / send in a StormChat
// thread". Both the groups-list API and the messages API (read + send) defer to
// these pure functions so the rule is enforced identically everywhere AND is
// unit-tested (see access.test.ts).
//
// SECURITY MODEL
// --------------
// DIRECT MESSAGE: a strictly 2-person conversation. Its two participants are the
// CANONICAL pair encoded in `dmKey` (the sorted two user _ids) — NOT the mutable
// `members[]` array. `members[]` can be polluted by other code (a branch/join
// auto-add once wrote a 3rd id into it); authorizing off `members[]` therefore
// leaks the DM. We authorize off `dmParticipants()` instead, so a polluted
// members array can NEVER grant access, and there is NO admin override for a DM.
//
// GROUP (public/private): unchanged — members (and a system admin) may read;
// non-members may still discover a group that carries a public/private
// visibility. DMs never carry a visibility.

import { isDmGroup } from './isDm';

// `viewerIds` = every id form that could appear for this user (their app id AND
// their Mongo _id string), matching what the API builds.
export function isMemberOf(group: any, viewerIds: string[]): boolean {
  const ids = new Set(viewerIds.map(String));
  const inList = (arr: any) => Array.isArray(arr) && arr.some((m: any) => ids.has(String(m)));
  return inList(group?.members) || inList(group?.admins);
}

/**
 * The CANONICAL two participants of a DM, robust to a polluted `members[]`.
 * Returns null when the thread is not a DM, or when its DM identity cannot be
 * trusted (so authorization denies rather than leaks).
 *
 *  - not a DM                      -> null (caller uses group rules)
 *  - valid dmKey (exactly 2 ids)   -> those 2 ids  (pollution-proof)
 *  - dmKey present but not 2 ids   -> null (untrusted; never fall back to members)
 *  - legacy DM, no dmKey, 2 members-> those 2 members
 *  - legacy DM, no dmKey, !=2      -> null (cannot tell the true pair; deny, don't leak)
 */
export function dmParticipants(group: any): string[] | null {
  if (!isDmGroup(group)) return null;

  const key = group?.dmKey;
  if (typeof key === 'string' && key.length > 0) {
    const pair = key.split('__').map((s: string) => s.trim()).filter(Boolean);
    return pair.length === 2 ? pair : null;
  }

  // Legacy DM with no dmKey: trust ONLY a clean 2-member thread. A polluted
  // legacy DM (>2 members, no key) authorizes nobody until cleaned/backfilled —
  // never grant access off a polluted members array.
  const members = Array.isArray(group?.members) ? group.members.map(String) : [];
  return members.length === 2 ? members : null;
}

function viewerIsParticipant(parts: string[] | null, viewerIds: string[]): boolean {
  if (!parts || parts.length === 0) return false;
  const ids = new Set(viewerIds.map(String));
  return parts.some((p) => ids.has(String(p)));
}

function isDiscoverableGroup(group: any): boolean {
  return !isDmGroup(group) && (group?.visibility === 'public' || group?.visibility === 'private');
}

/** May this viewer see the thread in their chat LIST? */
export function canSeeGroupInList(group: any, viewerIds: string[]): boolean {
  if (isDmGroup(group)) {
    // DM: ONLY the two canonical participants. No members[] trust.
    return viewerIsParticipant(dmParticipants(group), viewerIds);
  }
  // Group: members always; non-members only if it is explicitly discoverable.
  return isMemberOf(group, viewerIds) || isDiscoverableGroup(group);
}

/** May this viewer READ the thread's messages? */
export function canReadMessages(group: any, viewerIds: string[], viewerRole?: string): boolean {
  if (isDmGroup(group)) {
    // DM: ONLY the two canonical participants. No members[] trust, NO admin override.
    return viewerIsParticipant(dmParticipants(group), viewerIds);
  }
  if (isMemberOf(group, viewerIds)) return true;
  if ((viewerRole || '').toLowerCase() === 'admin') return true;
  return false;
}

/**
 * May this viewer SEND / reply in the thread?
 * DM: ONLY the two canonical participants (no admin override). Group: a member
 * or a system admin — the endpoint applies any `onlyAdminCanChat` rule on top.
 */
export function canSendMessage(group: any, viewerIds: string[], viewerRole?: string): boolean {
  if (isDmGroup(group)) {
    return viewerIsParticipant(dmParticipants(group), viewerIds);
  }
  if (isMemberOf(group, viewerIds)) return true;
  if ((viewerRole || '').toLowerCase() === 'admin') return true;
  return false;
}

// ---------------------------------------------------------------------------
// GROUP ROLES (GroupMe model, decided by Youssef 2026-10-15)
// ---------------------------------------------------------------------------
// Job titles give NO chat powers. Inside a group there are only two kinds of
// people: a GROUP ADMIN (listed in group.admins) and a MEMBER. Exceptions:
//  - a company Admin account is a group admin of every group by default
//    (rights only: they are not listed as a member and get no alerts), but
//    never of a DM;
//  - only today's group creators (GROUP_CREATOR_ROLES) may create a group;
//    the creator becomes its first group admin;
//  - only the group's creator may delete the whole group, unless the creator's
//    account is gone, in which case a company Admin may.
// C-level and branch managers are ordinary members unless made group admin.

const isCompanyAdmin = (role?: string) => (role || '').toLowerCase() === 'admin';

/** Roles allowed to CREATE a group (the only job-title rule left). */
export const GROUP_CREATOR_ROLES = ['admin', 'c-level', 'branch-manager', 'sales-team-lead'];

export function canCreateGroup(viewerRole?: string): boolean {
  return GROUP_CREATOR_ROLES.includes((viewerRole || '').toLowerCase());
}

/** Is this viewer a group admin here? Never true in a DM. */
export function isGroupAdmin(group: any, viewerIds: string[], viewerRole?: string): boolean {
  if (isDmGroup(group)) return false;
  if (isCompanyAdmin(viewerRole)) return true;
  const ids = new Set(viewerIds.map(String));
  return Array.isArray(group?.admins) && group.admins.some((a: any) => ids.has(String(a)));
}

/** Edit name/picture/members/admins/settings, approve join requests. */
export function canManageGroup(group: any, viewerIds: string[], viewerRole?: string): boolean {
  return isGroupAdmin(group, viewerIds, viewerRole);
}

/** Delete other people's messages in the group. Never in a DM. */
export function canModerateMessages(group: any, viewerIds: string[], viewerRole?: string): boolean {
  return isGroupAdmin(group, viewerIds, viewerRole);
}

/**
 * Delete the whole group: its creator; or, when the creator's account no
 * longer exists / is deleted (`creatorActive` false), a company Admin.
 */
export function canDeleteGroup(
  group: any,
  viewerIds: string[],
  viewerRole: string | undefined,
  creatorActive: boolean,
): boolean {
  if (isDmGroup(group)) return false;
  const ids = new Set(viewerIds.map(String));
  if (group?.createdBy && ids.has(String(group.createdBy))) return true;
  return isCompanyAdmin(viewerRole) && !creatorActive;
}

/** Explicitly listed (members or admins), not just a company Admin's rights. */
function isListedMember(group: any, viewerIds: string[]): boolean {
  return isMemberOf(group, viewerIds);
}

export type ChatRights = {
  isMember: boolean;
  isGroupAdmin: boolean;
  canRead: boolean;
  canSend: boolean;
  canPin: boolean;
  canModerate: boolean;
  canManage: boolean;
  canDelete: boolean;
  canLeave: boolean;
};

/**
 * Everything one viewer may do in one thread, so the screen shows exactly the
 * controls the server will accept (the web used to guess, and locked C-level
 * and team-lead group admins out of groups the server let them post in).
 */
export function chatRights(
  group: any,
  viewerIds: string[],
  viewerRole: string | undefined,
  creatorActive: boolean,
): ChatRights {
  const dm = isDmGroup(group);
  const admin = isGroupAdmin(group, viewerIds, viewerRole);
  const listed = dm ? viewerIsParticipant(dmParticipants(group), viewerIds) : isListedMember(group, viewerIds);
  const canRead = canReadMessages(group, viewerIds, viewerRole);
  const adminOnly = !dm && !!group?.onlyAdminCanChat;
  const canSend = canSendMessage(group, viewerIds, viewerRole) && (!adminOnly || admin);
  return {
    isMember: listed,
    isGroupAdmin: admin,
    canRead,
    canSend,
    // Anyone who can post can pin (Youssef: anyone in the group may pin).
    canPin: canSend,
    canModerate: canModerateMessages(group, viewerIds, viewerRole),
    canManage: canManageGroup(group, viewerIds, viewerRole),
    canDelete: canDeleteGroup(group, viewerIds, viewerRole, creatorActive),
    canLeave: !dm && listed,
  };
}
