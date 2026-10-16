// Muting a chat for a set time (GroupMe-style; Youssef, 2026-10-16): 1 hour,
// 8 hours, 1 day, or until you turn it back on. `mutedBy` stays the list of
// people who muted (so the phone app's plain on/off keeps working); an end
// time, when there is one, lives in `mutedUntil[<their Mongo _id>]`. A mute
// whose end time has passed simply stops counting, nothing has to clean it up.

export const MUTE_CHOICES = ['1h', '8h', '1d', 'forever'] as const;
export type MuteChoice = (typeof MUTE_CHOICES)[number];

const LENGTH_MS: Record<Exclude<MuteChoice, 'forever'>, number> = {
  '1h': 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

export function isMuteChoice(x: unknown): x is MuteChoice {
  return typeof x === 'string' && (MUTE_CHOICES as readonly string[]).includes(x);
}

/** When a mute chosen now ends; null = until turned back on. */
export function muteEndsAt(choice: MuteChoice, now = Date.now()): Date | null {
  return choice === 'forever' ? null : new Date(now + LENGTH_MS[choice]);
}

type Mutable = { mutedBy?: unknown[] | null; mutedUntil?: unknown };

function endOf(group: Mutable, id: string): unknown {
  const until = group.mutedUntil as any;
  if (!until) return undefined;
  return typeof until.get === 'function' ? until.get(id) : until[id];
}

// In force at `now`: no end time, an unreadable one (treated as no end), or
// one still ahead.
function inForce(end: unknown, now: number): boolean {
  if (end === undefined || end === null || end === '') return true;
  const t = new Date(end as any).getTime();
  return Number.isNaN(t) || t > now;
}

/** Mongo _ids of everyone whose mute is in force now. */
export function activeMutedIds(group: Mutable, now = Date.now()): string[] {
  return (group.mutedBy || []).map(String).filter((id) => inForce(endOf(group, id), now));
}

/** The viewer's own mute: whether it's in force, and until when (ISO, or null for no end). */
export function viewerMute(group: Mutable, viewerIds: string[], now = Date.now()): { muted: boolean; until: string | null } {
  const mine = (group.mutedBy || []).map(String).find((id) => viewerIds.includes(id));
  if (!mine) return { muted: false, until: null };
  const end = endOf(group, mine);
  if (!inForce(end, now)) return { muted: false, until: null };
  const t = end === undefined || end === null || end === '' ? NaN : new Date(end as any).getTime();
  return { muted: true, until: Number.isNaN(t) ? null : new Date(t).toISOString() };
}

/** "4:30 PM" today, "Sat 10:00 AM" another day, in Central time like the rest of the chat. */
export function muteUntilLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const tz = 'America/Chicago';
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: tz });
  // Newer ICU puts a narrow no-break space before AM/PM; keep it a plain space.
  const time = d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).replace(/\u202f/g, ' ');
  return day(d) === day(new Date(now)) ? time : `${d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' })} ${time}`;
}
