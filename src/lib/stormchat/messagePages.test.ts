import { describe, it, expect } from 'vitest';
import { mergeNewestPage, prependOlderPage, compareMessages } from './messagePages';

const msg = (n: number, extra: Record<string, unknown> = {}) => ({
  _id: `m${String(n).padStart(4, '0')}`, createdAt: new Date(Date.UTC(2026, 9, 15, 0, 0, n)).toISOString(), ...extra,
});
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => msg(a + i));
const ids = (list: { _id: string }[]) => list.map((m) => m._id);

describe('mergeNewestPage', () => {
  it('a short page is the whole chat', () => {
    expect(ids(mergeNewestPage(range(1, 10), range(1, 3), 100))).toEqual(ids(range(1, 3)));
  });

  it('keeps older pages the person scrolled up to, refreshes the newest page', () => {
    const onScreen = range(1, 150);              // scrolled up: 1..150
    const fresh = range(52, 151);                 // newest 100 now: 52..151
    const merged = mergeNewestPage(onScreen, fresh, 100);
    expect(ids(merged)).toEqual(ids(range(1, 151)));
  });

  it('a message deleted inside the newest page disappears', () => {
    const onScreen = range(1, 150);
    const fresh = range(51, 150).filter((m) => m._id !== 'm0120');
    const merged = mergeNewestPage(onScreen, [msg(50), ...fresh], 100);
    expect(ids(merged)).not.toContain('m0120');
    expect(merged).toHaveLength(149);
  });

  it('reactions on recent messages come from the fresh copy', () => {
    const onScreen = range(1, 120);
    const fresh = range(21, 120).map((m) => (m._id === 'm0100' ? { ...m, reactions: ['👍'] } : m));
    const merged = mergeNewestPage(onScreen, fresh, 100) as any[];
    expect(merged.find((m) => m._id === 'm0100').reactions).toEqual(['👍']);
  });
});

describe('prependOlderPage', () => {
  it('adds an older page in front, in order, without duplicates', () => {
    const merged = prependOlderPage(range(51, 150), range(1, 51));
    expect(ids(merged)).toEqual(ids(range(1, 150)));
  });
});

describe('compareMessages', () => {
  it('breaks equal timestamps by id', () => {
    const a = { _id: 'a', createdAt: '2026-10-15T00:00:00Z' };
    const b = { _id: 'b', createdAt: '2026-10-15T00:00:00Z' };
    expect(compareMessages(a, b)).toBeLessThan(0);
  });
});
