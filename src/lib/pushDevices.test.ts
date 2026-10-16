import { describe, it, expect } from 'vitest';
import { rememberDevice, pushTargets, isDeadDeviceError, MAX_DEVICES } from './pushDevices';

describe('rememberDevice', () => {
  it('adds a new device at the end', () => {
    expect(rememberDevice(['phone'], 'browser')).toEqual(['phone', 'browser']);
  });
  it('re-registering moves a device to newest without duplicating it', () => {
    expect(rememberDevice(['phone', 'browser'], 'phone')).toEqual(['browser', 'phone']);
  });
  it('keeps at most MAX_DEVICES, dropping the oldest', () => {
    const many = Array.from({ length: MAX_DEVICES }, (_, i) => `d${i}`);
    const next = rememberDevice(many, 'new');
    expect(next).toHaveLength(MAX_DEVICES);
    expect(next[0]).toBe('d1');
    expect(next.at(-1)).toBe('new');
  });
  it('ignores empty entries', () => {
    expect(rememberDevice([null, '', 'phone'], 'browser')).toEqual(['phone', 'browser']);
  });
});

describe('pushTargets', () => {
  it('a push for the browser also reaches the same person\'s phone (the bug)', () => {
    const owner = { fcmToken: 'browser', fcmTokens: ['phone', 'browser'] };
    expect(pushTargets(['browser'], [owner]).sort()).toEqual(['browser', 'phone']);
  });
  it('old accounts with only fcmToken still work', () => {
    expect(pushTargets(['phone'], [{ fcmToken: 'phone' }])).toEqual(['phone']);
  });
  it('several people, no duplicates', () => {
    const a = { fcmToken: 'a2', fcmTokens: ['a1', 'a2'] };
    const b = { fcmToken: 'b1', fcmTokens: ['b1'] };
    expect(pushTargets(['a2', 'b1'], [a, b]).sort()).toEqual(['a1', 'a2', 'b1']);
  });
});

describe('isDeadDeviceError', () => {
  it('recognises gone devices only', () => {
    expect(isDeadDeviceError('messaging/registration-token-not-registered')).toBe(true);
    expect(isDeadDeviceError('messaging/internal-error')).toBe(false);
  });
});
