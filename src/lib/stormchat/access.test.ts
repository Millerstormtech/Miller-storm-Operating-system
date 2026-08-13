import { describe, it, expect } from 'vitest';
import { canSeeGroupInList, canReadMessages, canSendMessage, dmParticipants } from './access';

// Users, identified the way group.members / dmKey store them (Mongo _id
// strings). Each viewer's id-set is [appId, _id] like the API builds.
const SUPERADMIN = { app: 'user-superadmin', _id: 'aaaaaaaaaaaaaaaaaaaaaaa1', role: 'admin' };
const MARCUS     = { app: 'user-marcus',     _id: 'aaaaaaaaaaaaaaaaaaaaaaa2' };
const AUSTON     = { app: 'user-auston',     _id: 'aaaaaaaaaaaaaaaaaaaaaaa3' };
const CARLEY     = { app: 'user-carley',     _id: 'aaaaaaaaaaaaaaaaaaaaaaa4' };
const OTHERADMIN = { app: 'user-otheradmin', _id: 'aaaaaaaaaaaaaaaaaaaaaaa5', role: 'admin' };

const ids = (u: { app: string; _id: string }) => [u.app, u._id];
const dmKeyOf = (a: { _id: string }, b: { _id: string }) => [a._id, b._id].sort().join('__');

describe('dmParticipants (canonical DM identity)', () => {
  it('uses dmKey, NOT the (possibly polluted) members array', () => {
    const polluted = {
      _id: 'g1', name: 'Direct Message', isDirect: true,
      dmKey: dmKeyOf(SUPERADMIN, MARCUS),
      members: [SUPERADMIN._id, MARCUS._id, AUSTON._id], // polluted with a 3rd
      admins: [],
    };
    expect(dmParticipants(polluted)!.sort()).toEqual([SUPERADMIN._id, MARCUS._id].sort());
    expect(dmParticipants(polluted)).not.toContain(AUSTON._id);
  });

  it('returns null for a non-DM group', () => {
    expect(dmParticipants({ _id: 'g', name: 'Team', members: [MARCUS._id], visibility: 'private' })).toBeNull();
  });

  it('falls back to 2 members for a legacy DM with no dmKey', () => {
    const legacy = { _id: 'g', name: 'chat', members: [SUPERADMIN._id, MARCUS._id], admins: [] };
    expect(dmParticipants(legacy)!.sort()).toEqual([SUPERADMIN._id, MARCUS._id].sort());
  });
});

// THE ACCEPTANCE CRITERIA: a polluted Super Admin <-> Marcus DM.
// members = [SuperAdmin, Marcus, Auston]; dmKey = SuperAdmin__Marcus; isDirect.
describe('Polluted DM: Super Admin <-> Marcus (Auston wrongly in members[])', () => {
  const DM = {
    _id: 'dm-sa-marcus',
    name: 'Direct Message',
    isDirect: true,
    dmKey: dmKeyOf(SUPERADMIN, MARCUS),
    members: [SUPERADMIN._id, MARCUS._id, AUSTON._id], // POLLUTED
    admins: [],
    visibility: undefined,
  };

  it('Super Admin: sees, reads, sends', () => {
    expect(canSeeGroupInList(DM, ids(SUPERADMIN))).toBe(true);
    expect(canReadMessages(DM, ids(SUPERADMIN), SUPERADMIN.role)).toBe(true);
    expect(canSendMessage(DM, ids(SUPERADMIN), SUPERADMIN.role)).toBe(true);
  });

  it('Marcus: sees, reads, sends', () => {
    expect(canSeeGroupInList(DM, ids(MARCUS))).toBe(true);
    expect(canReadMessages(DM, ids(MARCUS))).toBe(true);
    expect(canSendMessage(DM, ids(MARCUS))).toBe(true);
  });

  it('Auston: NOT in list, cannot read, cannot send — even though he is in members[]', () => {
    expect(canSeeGroupInList(DM, ids(AUSTON))).toBe(false);
    expect(canReadMessages(DM, ids(AUSTON))).toBe(false);   // == 403 at the endpoint
    expect(canSendMessage(DM, ids(AUSTON))).toBe(false);    // == 403 at the endpoint
  });

  it('A different admin: cannot see/read/send (no admin override for a DM)', () => {
    expect(canSeeGroupInList(DM, ids(OTHERADMIN))).toBe(false);
    expect(canReadMessages(DM, ids(OTHERADMIN), OTHERADMIN.role)).toBe(false);
    expect(canSendMessage(DM, ids(OTHERADMIN), OTHERADMIN.role)).toBe(false);
  });

  it('Another unrelated user (Carley): cannot see/read/send', () => {
    expect(canSeeGroupInList(DM, ids(CARLEY))).toBe(false);
    expect(canReadMessages(DM, ids(CARLEY))).toBe(false);
    expect(canSendMessage(DM, ids(CARLEY))).toBe(false);
  });
});

describe('Super Admin <-> Auston DM: Marcus excluded', () => {
  const DM = {
    _id: 'dm-sa-auston', name: 'Direct Message', isDirect: true,
    dmKey: dmKeyOf(SUPERADMIN, AUSTON),
    members: [SUPERADMIN._id, AUSTON._id], admins: [],
  };
  it('Super Admin and Auston: yes; Marcus: no', () => {
    expect(canReadMessages(DM, ids(SUPERADMIN), SUPERADMIN.role)).toBe(true);
    expect(canReadMessages(DM, ids(AUSTON))).toBe(true);
    expect(canSeeGroupInList(DM, ids(MARCUS))).toBe(false);
    expect(canReadMessages(DM, ids(MARCUS))).toBe(false);
  });
});

describe('Marcus <-> Carley DM: Super Admin and Auston excluded', () => {
  const DM = {
    _id: 'dm-marcus-carley', name: 'Direct Message', isDirect: true,
    dmKey: dmKeyOf(MARCUS, CARLEY),
    members: [MARCUS._id, CARLEY._id], admins: [],
  };
  it('Marcus and Carley: yes; Super Admin and Auston: no', () => {
    expect(canReadMessages(DM, ids(MARCUS))).toBe(true);
    expect(canReadMessages(DM, ids(CARLEY))).toBe(true);
    expect(canReadMessages(DM, ids(SUPERADMIN), SUPERADMIN.role)).toBe(false);
    expect(canSeeGroupInList(DM, ids(SUPERADMIN))).toBe(false);
    expect(canReadMessages(DM, ids(AUSTON))).toBe(false);
    expect(canSeeGroupInList(DM, ids(AUSTON))).toBe(false);
  });
});

describe('Legacy 2-member DM (no isDirect, no dmKey, no visibility)', () => {
  const DM = { _id: 'dm-legacy', name: 'chat', members: [SUPERADMIN._id, MARCUS._id], admins: [] };
  it('the two members access it; a third user cannot', () => {
    expect(canSeeGroupInList(DM, ids(MARCUS))).toBe(true);
    expect(canReadMessages(DM, ids(MARCUS))).toBe(true);
    expect(canSeeGroupInList(DM, ids(AUSTON))).toBe(false);
    expect(canReadMessages(DM, ids(AUSTON))).toBe(false);
    expect(canReadMessages(DM, ids(OTHERADMIN), OTHERADMIN.role)).toBe(false); // no admin override
  });
});

describe('does not change public / private group behaviour', () => {
  const PUBLIC = { _id: 'grp-public', name: 'Main Chat', members: [MARCUS._id], admins: [MARCUS._id], visibility: 'public' };
  const PRIVATE = { _id: 'grp-private', name: 'Dallas Branch', members: [MARCUS._id], admins: [MARCUS._id], visibility: 'private' };

  it('public group: member reads/sends; non-member discovers + admin reads', () => {
    expect(canSeeGroupInList(PUBLIC, ids(MARCUS))).toBe(true);
    expect(canSendMessage(PUBLIC, ids(MARCUS))).toBe(true);
    expect(canSeeGroupInList(PUBLIC, ids(AUSTON))).toBe(true);        // discoverable
    expect(canReadMessages(PUBLIC, ids(SUPERADMIN), SUPERADMIN.role)).toBe(true); // admin can read a GROUP
  });

  it('private group: member reads; non-member can discover (request to join); admin reads', () => {
    expect(canSeeGroupInList(PRIVATE, ids(MARCUS))).toBe(true);
    expect(canSeeGroupInList(PRIVATE, ids(AUSTON))).toBe(true);       // discoverable -> can request
    expect(canReadMessages(PRIVATE, ids(AUSTON))).toBe(false);        // but not a member -> cannot read
    expect(canReadMessages(PRIVATE, ids(SUPERADMIN), SUPERADMIN.role)).toBe(true); // admin can read a GROUP
  });
});
