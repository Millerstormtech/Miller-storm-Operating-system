import { describe, it, expect } from 'vitest';
import { mentionedIds, mentionsAll, alertPlan } from './mentions';

const people = [
  { _id: 'sam', name: 'Sam Taylor' },
  { _id: 'rob', name: 'Rob Rep' },
  { _id: 'jo', name: 'Jo' },
];

describe('mentionedIds', () => {
  it.each([
    ['hi @Sam Taylor how are you', ['sam']],
    ['@Sam Taylor, can you call?', ['sam']],
    ['thanks @Sam Taylor.', ['sam']],
    ['nice @Sam Taylor!', ['sam']],
    ['done @Sam Taylor?', ['sam']],
    ['(cc @Sam Taylor)', ['sam']],
    ['@sam taylor lower case', ['sam']],
    ['@Sam Taylor', ['sam']],
    ['@Sam Taylor and @Rob Rep: meeting', ['sam', 'rob']],
  ])('"%s" mentions %j', (text, expected) => {
    expect(mentionedIds(text as string, people)).toEqual(expected);
  });

  it('a longer word after the name is not a mention', () => {
    expect(mentionedIds('@Sam Taylorson', people)).toEqual([]);
    expect(mentionedIds('@Joanne', people)).toEqual([]);
  });

  it('"@Name" counts wherever it ends a word, even glued to text before it (known, harmless)', () => {
    expect(mentionedIds('write to x@jo', people)).toEqual(['jo']);
  });
});

describe('mentionsAll', () => {
  it.each(['@all heads up', 'Heads up @all', 'heads up @ALL!', '@all, meeting at 5'])('"%s" is @all', (t) => {
    expect(mentionsAll(t)).toBe(true);
  });
  it.each(['@alliance', 'email@all.com', 'all of you', ''])('"%s" is not @all', (t) => {
    expect(mentionsAll(t)).toBe(false);
  });
});

describe('alertPlan', () => {
  const base = { members: ['me', 'a', 'b', 'c'], senderIds: ['user-me', 'me'], mentioned: [], atAll: false, senderIsAdmin: false, mutedBy: [] as string[] };

  it('ordinary message: everyone but the sender', () => {
    expect(alertPlan(base)).toEqual({ mention: [], ordinary: ['a', 'b', 'c'] });
  });
  it('muted people get no ordinary alert', () => {
    expect(alertPlan({ ...base, mutedBy: ['b'] })).toEqual({ mention: [], ordinary: ['a', 'c'] });
  });
  it('a mention reaches someone who muted the group', () => {
    expect(alertPlan({ ...base, mutedBy: ['b'], mentioned: ['b'] })).toEqual({ mention: ['b'], ordinary: ['a', 'c'] });
  });
  it('@all from a group admin mentions everyone, muted included', () => {
    expect(alertPlan({ ...base, atAll: true, senderIsAdmin: true, mutedBy: ['b'] })).toEqual({ mention: ['a', 'b', 'c'], ordinary: [] });
  });
  it('@all from a regular member does nothing special', () => {
    expect(alertPlan({ ...base, atAll: true, senderIsAdmin: false, mutedBy: ['b'] })).toEqual({ mention: [], ordinary: ['a', 'c'] });
  });
  it('you never alert yourself, and non-members are ignored', () => {
    expect(alertPlan({ ...base, mentioned: ['me', 'zz', 'a'] })).toEqual({ mention: ['a'], ordinary: ['b', 'c'] });
  });
});
