// src/lib/canvass/doors.ts
// RepCard doors on the Canvass Map: position, current status and knock history,
// from one item of RepCard GET /customers (RepCard calls a door a "customer").
//
// Deliberately NOT kept: the homeowner's name, email, phone, short name, notes,
// attachments and custom fields (spec B8). Rep names are kept for the house card.
//
// Pure: no DB, no network.

export type DoorKnock = { at: string; status: string; userId: number | null; rep: string; verified: boolean };
export type DoorStatusChange = { at: string; from: string; to: string; userId: number | null; rep: string };
export type DoorEvent = { at: string; status: string; rep: string };

export type DoorRecord = {
  doorId: number; // RepCard customer id; 0 when RepCard sent none
  houseId: string;
  location: { type: "Point"; coordinates: [number, number] } | null; // [longitude, latitude]
  address: { line: string; city: string; state: string; zip: string };
  contactType: string; // Lead, Customer, Other
  status: string; // current status label
  statusAt: string | null; // when the current status was set, as far as RepCard shows
  statusAtSource: "log" | "knock" | "updated" | null;
  ownerUserId: number | null;
  knocks: DoorKnock[]; // oldest first
  statusChanges: DoorStatusChange[]; // oldest first
  doorCreatedAt: string | null;
  doorUpdatedAt: string | null;
};

/** The same status recorded again within this long is the same event (a knock and its status change land seconds apart). */
const REPEAT_WINDOW_MS = 10 * 60 * 1000;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const userIdOf = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const byTime = (a: { at: string }, b: { at: string }) => a.at.localeCompare(b.at);
const hasTime = <T extends { at: string | null }>(item: T): item is T & { at: string } => item.at !== null;

/** RepCard times carry six decimals ("2024-05-06T20:15:30.123456Z"). Returns a standard UTC timestamp, or null. */
export function repcardTime(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const ms = Date.parse(raw.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function coordinate(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

/** A GeoJSON point from RepCard's text coordinates, or null when missing, zero or impossible. */
function doorPoint(latitude: unknown, longitude: unknown): DoorRecord["location"] {
  const lat = coordinate(latitude);
  const lon = coordinate(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 || lon === 0 || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { type: "Point", coordinates: [lon, lat] };
}

const knockKey = (knock: any) => `${knock?.userId}|${repcardTime(knock?.door_knocked_at)}|${text(knock?.status)}`;
const listOf = (value: unknown): any[] => (Array.isArray(value) ? value : []);

export function mapDoor(customer: any): DoorRecord {
  // Every verified knock is also in doorKnocks (checked 15 Sep), so it only sets a flag.
  const verifiedKeys = new Set(listOf(customer?.verifiedDoorKnocks).map(knockKey));
  const knocks: DoorKnock[] = listOf(customer?.doorKnocks)
    .map((knock) => ({
      at: repcardTime(knock?.door_knocked_at),
      status: text(knock?.status),
      userId: userIdOf(knock?.userId),
      rep: text(knock?.user),
      verified: verifiedKeys.has(knockKey(knock)),
    }))
    .filter(hasTime)
    .sort(byTime);
  const statusChanges: DoorStatusChange[] = listOf(customer?.statusChangeLogs)
    .map((change) => ({
      at: repcardTime(change?.createdAt),
      from: text(change?.statusFrom),
      to: text(change?.statusTo),
      userId: userIdOf(change?.userId),
      rep: text(change?.user),
    }))
    .filter(hasTime)
    .sort(byTime);

  // The current status is not always the newest status change (85 of 100 on 15 Sep),
  // so its date comes from the newest change to it, else the newest knock with it,
  // else the record's last update.
  const status = text(customer?.statusTitle);
  const doorUpdatedAt = repcardTime(customer?.updatedAt);
  let statusAt: string | null = null;
  let statusAtSource: DoorRecord["statusAtSource"] = null;
  if (status) {
    const change = [...statusChanges].reverse().find((c) => c.to === status);
    const knock = [...knocks].reverse().find((k) => k.status === status);
    if (change) [statusAt, statusAtSource] = [change.at, "log"];
    else if (knock) [statusAt, statusAtSource] = [knock.at, "knock"];
    else if (doorUpdatedAt) [statusAt, statusAtSource] = [doorUpdatedAt, "updated"];
  }

  const doorId = Number(customer?.id);
  return {
    doorId: Number.isInteger(doorId) && doorId > 0 ? doorId : 0,
    houseId: text(customer?.houseId),
    location: doorPoint(customer?.latitude, customer?.longitude),
    address: {
      line: [text(customer?.address), text(customer?.address2)].filter(Boolean).join(" "),
      city: text(customer?.city),
      state: text(customer?.state),
      zip: text(customer?.zip),
    },
    contactType: text(customer?.typeDisplayName),
    status,
    statusAt,
    statusAtSource,
    ownerUserId: userIdOf(customer?.ownerId ?? customer?.userId),
    knocks,
    statusChanges,
    doorCreatedAt: repcardTime(customer?.createdAt),
    doorUpdatedAt,
  };
}

/**
 * Everything RepCard recorded at a door, oldest first: knocks, status changes and
 * the current status. The same status again within 10 minutes counts once, so a
 * knock and the status change it caused are one event.
 */
export function doorEvents(door: Pick<DoorRecord, "knocks" | "statusChanges" | "status" | "statusAt">): DoorEvent[] {
  const events: DoorEvent[] = [
    ...door.knocks.map((k) => ({ at: k.at, status: k.status, rep: k.rep })),
    ...door.statusChanges.map((c) => ({ at: c.at, status: c.to, rep: c.rep })),
  ];
  if (door.status && door.statusAt) events.push({ at: door.statusAt, status: door.status, rep: "" });

  const kept: DoorEvent[] = [];
  const lastKept = new Map<string, number>();
  for (const event of events.filter((e) => e.status && e.at).sort(byTime)) {
    const ms = Date.parse(event.at);
    const previous = lastKept.get(event.status);
    if (previous !== undefined && ms - previous <= REPEAT_WINDOW_MS) continue;
    kept.push(event);
    lastKept.set(event.status, ms);
  }
  return kept;
}
