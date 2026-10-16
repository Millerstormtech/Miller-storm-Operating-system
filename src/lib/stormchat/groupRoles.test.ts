import { describe, it, expect } from 'vitest';
import {
  canCreateGroup, isGroupAdmin, canManageGroup, canModerateMessages, canDeleteGroup, chatRights,
} from './access';

// The GroupMe permission model decided 2026-10-15: per-group admin vs member,
// no chat powers from job title except company Admin (group admin everywhere
// but DMs) and who may create a group.

const TL = { app: 'user-tl', _id: '0000000000000000000000a1' };       // team lead, group admin of Leads
const REP = { app: 'user-rep', _id: '0000000000000000000000a2' };     // plain member
const CL = { app: 'user-cl', _id: '0000000000000000000000a3' };       // c-level, plain member
const BM = { app: 'user-bm', _id: '0000000000000000000000a4' };       // branch manager, NOT a member
const ADMIN = { app: 'user-admin', _id: '0000000000000000000000a5' }; // company admin, NOT a member
const OTHER = { app: 'user-other', _id: '0000000000000000000000a6' };
const ids = (u: { app: string; _id: string }) => [u.app, u._id];

const leads = {
  _id: 'g-leads', name: 'Leads', visibility: 'private', createdBy: TL.app,
  members: [TL._id, REP._id, CL._id], admins: [TL._id], onlyAdminCanChat: false,
};
const announcements = { ...leads, _id: 'g-ann', name: 'Announcements', onlyAdminCanChat: true };
const dm = { _id: 'g-dm', isDirect: true, dmKey: [REP._id, OTHER._id].sort().join('__'), members: [REP._id, OTHER._id], admins: [] };

describe('canCreateGroup: only today\'s creators', () => {
  it.each(['admin', 'c-level', 'branch-manager', 'sales-team-lead'])('%s may create', (r) => {
    expect(canCreateGroup(r)).toBe(true);
  });
  it.each(['sales', 'marketing', '', undefined])('%s may not', (r) => {
    expect(canCreateGroup(r as any)).toBe(false);
  });
});

describe('isGroupAdmin / canManageGroup: per group, not per job title', () => {
  it('the group\'s own admin manages it, whatever their job title', () => {
    expect(canManageGroup(leads, ids(TL), 'sales-team-lead')).toBe(true);
    expect(canManageGroup(leads, ids(TL), 'sales')).toBe(true);
  });
  it('C-level and branch managers get NO manage rights from their title', () => {
    expect(canManageGroup(leads, ids(CL), 'c-level')).toBe(false);
    expect(canManageGroup(leads, ids(BM), 'branch-manager')).toBe(false);
  });
  it('a team lead cannot manage a group they are not admin of', () => {
    const other = { ...leads, admins: [REP._id] };
    expect(canManageGroup(other, ids(TL), 'sales-team-lead')).toBe(false);
  });
  it('a company Admin is a group admin of every group, even without being listed', () => {
    expect(isGroupAdmin(leads, ids(ADMIN), 'admin')).toBe(true);
  });
  it('nobody is a group admin of a DM, company Admin included', () => {
    expect(isGroupAdmin(dm, ids(REP), 'sales')).toBe(false);
    expect(isGroupAdmin(dm, ids(ADMIN), 'admin')).toBe(false);
    expect(canManageGroup(dm, ids(ADMIN), 'admin')).toBe(false);
  });
});

describe('canModerateMessages: group admins only', () => {
  it('group admin yes, member no, c-level no', () => {
    expect(canModerateMessages(leads, ids(TL), 'sales-team-lead')).toBe(true);
    expect(canModerateMessages(leads, ids(REP), 'sales')).toBe(false);
    expect(canModerateMessages(leads, ids(CL), 'c-level')).toBe(false);
  });
});

describe('canDeleteGroup: creator only, Admin when the creator is gone', () => {
  it('the creator may delete', () => {
    expect(canDeleteGroup(leads, ids(TL), 'sales-team-lead', true)).toBe(true);
  });
  it('another group admin may not', () => {
    const twoAdmins = { ...leads, admins: [TL._id, REP._id] };
    expect(canDeleteGroup(twoAdmins, ids(REP), 'sales', true)).toBe(false);
  });
  it('a company Admin may not while the creator is active', () => {
    expect(canDeleteGroup(leads, ids(ADMIN), 'admin', true)).toBe(false);
  });
  it('a company Admin may once the creator\'s account is gone', () => {
    expect(canDeleteGroup(leads, ids(ADMIN), 'admin', false)).toBe(true);
    expect(canDeleteGroup(leads, ids(CL), 'c-level', false)).toBe(false);
  });
  it('a DM can never be deleted as a group', () => {
    const mine = { ...dm, createdBy: REP.app };
    expect(canDeleteGroup(mine, ids(REP), 'sales', true)).toBe(false);
    expect(canDeleteGroup(dm, ids(ADMIN), 'admin', false)).toBe(false);
  });
});

describe('chatRights: what each person sees on screen', () => {
  it('admin-only group: group admin posts and pins, members only read', () => {
    const tl = chatRights(announcements, ids(TL), 'sales-team-lead', true);
    expect(tl).toMatchObject({ canRead: true, canSend: true, canPin: true, canManage: true });
    const rep = chatRights(announcements, ids(REP), 'sales', true);
    expect(rep).toMatchObject({ canRead: true, canSend: false, canPin: false, canManage: false });
  });
  it('C-level member of an admin-only group is a normal member there', () => {
    expect(chatRights(announcements, ids(CL), 'c-level', true)).toMatchObject({ canSend: false, canModerate: false });
  });
  it('C-level member of a normal group can post (was locked out on the web)', () => {
    expect(chatRights(leads, ids(CL), 'c-level', true)).toMatchObject({ canRead: true, canSend: true, canPin: true });
  });
  it('non-member branch manager: nothing', () => {
    expect(chatRights(leads, ids(BM), 'branch-manager', true)).toMatchObject({
      isMember: false, canRead: false, canSend: false, canManage: false, canLeave: false,
    });
  });
  it('company Admin not listed: full rights but is not a member and cannot leave', () => {
    expect(chatRights(leads, ids(ADMIN), 'admin', true)).toMatchObject({
      isMember: false, isGroupAdmin: true, canRead: true, canSend: true, canManage: true, canLeave: false,
    });
  });
  it('members can leave a group; nobody "leaves" a DM', () => {
    expect(chatRights(leads, ids(REP), 'sales', true).canLeave).toBe(true);
    expect(chatRights(dm, ids(REP), 'sales', true)).toMatchObject({ isMember: true, canSend: true, canLeave: false, canManage: false });
  });
  it('DM outsider (company Admin included) gets nothing', () => {
    expect(chatRights(dm, ids(ADMIN), 'admin', false)).toMatchObject({
      canRead: false, canSend: false, canPin: false, canModerate: false, canManage: false, canDelete: false,
    });
  });
});
