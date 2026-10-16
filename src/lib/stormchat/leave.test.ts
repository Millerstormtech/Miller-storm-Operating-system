import { describe, it, expect } from 'vitest';
import { leavePlan } from './leave';

const A = '0000000000000000000000b1'; // admin
const B = '0000000000000000000000b2'; // member
const C = '0000000000000000000000b3'; // member
const ids = (mongo: string) => [`user-${mongo.slice(-2)}`, mongo];

const group = { members: [A, B, C], admins: [A], leftMembers: [] as string[] };

describe('leavePlan (GroupMe "Leave group")', () => {
  it('a member leaves: removed from members, recorded as left', () => {
    const p = leavePlan(group, ids(B));
    expect(p).toEqual({ ok: true, members: [A, C], admins: [A], leftMembers: [B] });
  });

  it('someone not in the group cannot leave it', () => {
    expect(leavePlan(group, ids('0000000000000000000000b9'))).toMatchObject({ ok: false, status: 400 });
  });

  it('the last admin must name a new admin first', () => {
    expect(leavePlan(group, ids(A))).toMatchObject({ ok: false, status: 409, needsNewAdmin: true });
  });

  it('the last admin hands over and leaves', () => {
    expect(leavePlan(group, ids(A), C)).toEqual({ ok: true, members: [B, C], admins: [C], leftMembers: [A] });
  });

  it('the new admin must be someone still in the group', () => {
    expect(leavePlan(group, ids(A), A)).toMatchObject({ ok: false, status: 400 });
    expect(leavePlan(group, ids(A), '0000000000000000000000b9')).toMatchObject({ ok: false, status: 400 });
  });

  it('an admin leaves freely when another admin remains', () => {
    const two = { ...group, admins: [A, B] };
    expect(leavePlan(two, ids(A))).toEqual({ ok: true, members: [B, C], admins: [B], leftMembers: [A] });
  });

  it('the very last person simply leaves (no one to hand over to)', () => {
    expect(leavePlan({ members: [A], admins: [A] }, ids(A))).toEqual({ ok: true, members: [], admins: [], leftMembers: [A] });
  });

  it('keeps earlier leavers on the list', () => {
    const p = leavePlan({ ...group, leftMembers: [C] }, ids(B));
    expect(p).toMatchObject({ ok: true, leftMembers: [C, B] });
  });
});
