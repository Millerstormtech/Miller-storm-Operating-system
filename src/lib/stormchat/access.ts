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
