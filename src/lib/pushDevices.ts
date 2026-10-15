// Every device a person uses gets their push alerts (2026-10-15).
//
// Before, a user had ONE push address (User.fcmToken): logging into the
// website registered the browser and silently replaced the phone, so the
// phone stopped getting alerts (and the other way round). Now User.fcmTokens
// holds up to MAX_DEVICES addresses, newest last; fcmToken still holds the
// newest one so every existing reader keeps working.
//
// The senders in ./firebase-admin are handed whatever token(s) a caller read
// from fcmToken; they widen that to all of the owner's devices with
// pushTargets(). Pure so it is unit-tested.

export const MAX_DEVICES = 10;

type PushUser = { fcmToken?: string | null; fcmTokens?: (string | null)[] | null };

/** The device list after a device (re)registers: newest last, no repeats, capped. */
export function rememberDevice(existing: (string | null | undefined)[] | null | undefined, token: string): string[] {
  const list = (existing || []).filter((t): t is string => !!t && t !== token);
  return [...list, token].slice(-MAX_DEVICES);
}

/** All device addresses to send to: the requested ones plus every other device of their owners. */
export function pushTargets(requested: string[], owners: PushUser[]): string[] {
  const out = new Set(requested.filter(Boolean));
  for (const u of owners) {
    if (u.fcmToken) out.add(u.fcmToken);
    for (const t of u.fcmTokens || []) if (t) out.add(t);
  }
  return Array.from(out);
}

/** Firebase errors that mean the device is gone for good (uninstalled, logged out). */
export function isDeadDeviceError(code: unknown): boolean {
  return code === 'messaging/registration-token-not-registered'
    || code === 'messaging/invalid-registration-token'
    || code === 'messaging/invalid-argument';
}
