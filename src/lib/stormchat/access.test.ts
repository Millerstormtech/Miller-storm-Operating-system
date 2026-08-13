import { describe, it, expect } from 'vitest';
import { canSeeGroupInList, canReadMessages } from './access';

// Users, identified the way group.members / admins store them (Mongo _id
// strings). Each viewer's id-set is [appId, _id] like the API builds.
const SEEMA = { app: 'user-seema', _id: 'aaaaaaaaaaaaaaaaaaaaaaa1' };
const HEEMA = { app: 'user-heema', _id: 'aaaaaaaaaaaaaaaaaaaaaaa2' };
const RAJU  = { app: 'user-raju',  _id: 'aaaaaaaaaaaaaaaaaaaaaaa3' };
const ADMIN = { app: 'user-admin', _id: 'aaaaaaaaaaaaaaaaaaaaaaa4', role: 'admin' };

// User A / User B for the admin-DM scenario.
const USER_A = { app: 'user-a', _id: 'bbbbbbbbbbbbbbbbbbbbbbb1' };
const USER_B = { app: 'user-b', _id: 'bbbbbbbbbbbbbbbbbbbbbbb2' };

const ids = (u: { app: string; _id: string }) => [u.app, u._id];

// A DM exactly as pages/api/storm-chat/dm.ts creates it: 2 members (their _ids),
// isDirect + dmKey, NO visibility. Used by BOTH the rep DM picker and the admin
// StormChat DM picker (same endpoint).
const dm = (a: { _id: string }, b: { _id: string }) => ({
  _id: `dm-${a._id}-${b._id}`,
  name: 'Direct Message',
  members: [a._id, b._id],
  admins: [],
  isDirect: true,
  dmKey: [a._id, b._id].sort().join('__'),
});

const SEEMA_HEEMA_DM = dm(SEEMA, HEEMA);
const ADMIN_USERA_DM = dm(ADMIN, USER_A);

// A LEGACY DM that predates the flags AND was named something else — the exact
// shape that used to leak. 2 members, no isDirect/dmKey, no visibility.
const LEGACY_DM = {
  _id: 'dm-legacy',
  name: 'chat',
  members: [SEEMA._id, HEEMA._id],
  admins: [],
};

// A real, discoverable private group (created via POST -> has visibility).
const PRIVATE_GROUP = {
  _id: 'grp-private',
  name: 'Dallas Branch',
  members: [SEEMA._id],
  admins: [SEEMA._id],
  visibility: 'private',
};

describe('StormChat DM privacy', () => {
  it('Test 1&2: Seema and Heema both see their DM', () => {
    expect(canSeeGroupInList(SEEMA_HEEMA_DM, ids(SEEMA))).toBe(true);
    expect(canSeeGroupInList(SEEMA_HEEMA_DM, ids(HEEMA))).toBe(true);
  });

  it('Test 2: Heema can read the DM messages', () => {
    expect(canReadMessages(SEEMA_HEEMA_DM, ids(HEEMA))).toBe(true);
  });

  it('Test 3: Raju does NOT see the Seema<->Heema DM in his list', () => {
    expect(canSeeGroupInList(SEEMA_HEEMA_DM, ids(RAJU))).toBe(false);
    expect(canSeeGroupInList(LEGACY_DM, ids(RAJU))).toBe(false);
  });

  it('Test 4: Raju opening the DM directly is denied (no read access)', () => {
    expect(canReadMessages(SEEMA_HEEMA_DM, ids(RAJU))).toBe(false);
    expect(canReadMessages(LEGACY_DM, ids(RAJU))).toBe(false);
  });

  it('Test 5: admin cannot see or read someone else\'s DM', () => {
    expect(canSeeGroupInList(SEEMA_HEEMA_DM, ids(ADMIN))).toBe(false);
    expect(canReadMessages(SEEMA_HEEMA_DM, ids(ADMIN), ADMIN.role)).toBe(false);
    expect(canReadMessages(LEGACY_DM, ids(ADMIN), ADMIN.role)).toBe(false);
  });
});

// The reported scenario: an ADMIN messages User A from the admin panel. That is
// a real 2-member DM (admin + User A). Only those two may see/read it; User B
// must not — in the list, and not by group id either.
describe('Admin -> User DM privacy', () => {
  it('Admin and User A can see the Admin<->User A DM', () => {
    expect(canSeeGroupInList(ADMIN_USERA_DM, ids(ADMIN))).toBe(true);
    expect(canSeeGroupInList(ADMIN_USERA_DM, ids(USER_A))).toBe(true);
  });

  it('Admin and User A can read the Admin<->User A DM', () => {
    // Admin here is a MEMBER of this DM, so read is allowed (membership, not the
    // admin override — the override never applies to a DM).
    expect(canReadMessages(ADMIN_USERA_DM, ids(ADMIN), ADMIN.role)).toBe(true);
    expect(canReadMessages(ADMIN_USERA_DM, ids(USER_A))).toBe(true);
  });

  it('User A can reply (is a member -> read+write authorized)', () => {
    expect(canReadMessages(ADMIN_USERA_DM, ids(USER_A))).toBe(true);
  });

  it('User B does NOT see the Admin<->User A DM in their list', () => {
    expect(canSeeGroupInList(ADMIN_USERA_DM, ids(USER_B))).toBe(false);
  });

  it('User B cannot open/read the Admin<->User A DM even with the group id', () => {
    expect(canReadMessages(ADMIN_USERA_DM, ids(USER_B))).toBe(false);
  });
});

describe('does not change public/private group behaviour', () => {
  it('members see + read; a non-member still discovers a private group; admin can read a real group', () => {
    expect(canSeeGroupInList(PRIVATE_GROUP, ids(SEEMA))).toBe(true);   // member
    expect(canSeeGroupInList(PRIVATE_GROUP, ids(RAJU))).toBe(true);    // discoverable
    expect(canReadMessages(PRIVATE_GROUP, ids(ADMIN), 'admin')).toBe(true); // admin can read a GROUP
  });
});
