// Single source of truth for "who is allowed to see / read a StormChat thread".
//
// Both the groups-list API and the messages API defer to these pure functions
// so the DM-privacy rule is enforced identically everywhere AND is unit-tested
// (see access.test.ts). The rule is deliberately MEMBERSHIP-FIRST: a non-member
// can only ever see/read a thread that is an explicitly-discoverable GROUP
// (one carrying a public/private `visibility`, set only by group creation).
// A direct message never has a `visibility`, so it can never leak to anyone but
// its two members — regardless of flags, name, or member count.

import { isDmGroup } from './isDm';

// `viewerIds` = every id form that could appear in a group's members/admins for
// this user (their app id AND their Mongo _id string).
export function isMemberOf(group: any, viewerIds: string[]): boolean {
  const ids = new Set(viewerIds.map(String));
  const inList = (arr: any) => Array.isArray(arr) && arr.some((m: any) => ids.has(String(m)));
  return inList(group?.members) || inList(group?.admins);
}

function isDiscoverableGroup(group: any): boolean {
  return !isDmGroup(group) && (group?.visibility === 'public' || group?.visibility === 'private');
}

// May this viewer see the thread in their chat LIST?
// Members: always. Non-members: only a discoverable group (never a DM).
export function canSeeGroupInList(group: any, viewerIds: string[]): boolean {
  return isMemberOf(group, viewerIds) || isDiscoverableGroup(group);
}

// May this viewer READ the thread's messages?
// Members (and group admins, who are members): yes. A system admin may read a
// real GROUP but NEVER a DM. Everyone else: no.
export function canReadMessages(group: any, viewerIds: string[], viewerRole?: string): boolean {
  if (isMemberOf(group, viewerIds)) return true;
  if (!isDmGroup(group) && (viewerRole || '').toLowerCase() === 'admin') return true;
  return false;
}
