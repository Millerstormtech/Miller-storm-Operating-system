import { describe, it, expect } from 'vitest';
import { muteEndsAt, isMuteChoice, activeMutedIds, viewerMute } from './mute';

const NOW = Date.parse('2026-10-16T15:00:00Z');

describe('muteEndsAt', () => {
  it('ends 1 hour, 8 hours or 1 day from now, or never', () => {
    expect(muteEndsAt('1h', NOW)?.toISOString()).toBe('2026-10-16T16:00:00.000Z');
    expect(muteEndsAt('8h', NOW)?.toISOString()).toBe('2026-10-16T23:00:00.000Z');
    expect(muteEndsAt('1d', NOW)?.toISOString()).toBe('2026-10-17T15:00:00.000Z');
    expect(muteEndsAt('forever', NOW)).toBeNull();
  });

  it('only accepts the four choices', () => {
    expect(isMuteChoice('8h')).toBe(true);
    expect(isMuteChoice('2h')).toBe(false);
    expect(isMuteChoice(undefined)).toBe(false);
  });
});

describe('activeMutedIds', () => {
  it('counts mutes with no end, or an end still ahead', () => {
    const group = {
      mutedBy: ['a', 'b', 'c'],
      mutedUntil: { b: new Date(NOW + 60_000), c: new Date(NOW - 60_000) },
    };
    expect(activeMutedIds(group, NOW)).toEqual(['a', 'b']);
  });

  it('works with a Mongoose Map, and with no end times at all (older groups, the phone)', () => {
    const asMap = { mutedBy: ['a', 'b'], mutedUntil: new Map([['a', new Date(NOW - 1)]]) };
    expect(activeMutedIds(asMap, NOW)).toEqual(['b']);
    expect(activeMutedIds({ mutedBy: ['x'] }, NOW)).toEqual(['x']);
    expect(activeMutedIds({}, NOW)).toEqual([]);
  });
});

describe('viewerMute', () => {
  const group = { mutedBy: ['m-rita', 'm-tom'], mutedUntil: { 'm-tom': '2026-10-16T16:00:00.000Z' } };

  it('says until when, or no end', () => {
    expect(viewerMute(group, ['user-tom', 'm-tom'], NOW)).toEqual({ muted: true, until: '2026-10-16T16:00:00.000Z' });
    expect(viewerMute(group, ['user-rita', 'm-rita'], NOW)).toEqual({ muted: true, until: null });
  });

  it('is not muted once the time has passed, or if never muted', () => {
    expect(viewerMute(group, ['m-tom'], Date.parse('2026-10-16T16:00:01Z'))).toEqual({ muted: false, until: null });
    expect(viewerMute(group, ['m-rob'], NOW)).toEqual({ muted: false, until: null });
  });
});
