// Voice messages, shared locations, photo albums and poll end dates /
// voters: GroupMe-parity batch 2 (Youssef, 2026-10-16). Pure, so the server
// and the screens use the same rules.
//
// Each one is stored so the phone app shipped before it still shows
// something sensible (it falls back to plain text for kinds it doesn't know
// and shows one attachment per message):
// - a voice message is a FILE message with an audio attachment (old phones
//   show a file to tap, which plays it), plus `voice.durationSec`;
// - a location is a TEXT message with a maps link, plus `location`;
// - an album is up to 10 separate photo messages sharing an `albumId`.

import { attachmentProblem } from './compose';

// ── Voice messages ───────────────────────────────────────────────────────────

export const VOICE_MAX_SEC = 5 * 60; // Youssef: up to 5 minutes
const AUDIO_FILE = /\.(m4a|mp3|aac|wav|ogg|oga|opus|webm|mp4)$/i;

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The text stored with a voice message (what older phone builds show). */
export function voiceLabel(sec: number): string {
  return `🎤 Voice message (${formatDuration(sec)})`;
}

/** The voice details to store, or an error for the person. */
export function cleanVoice(voice: unknown, mediaUrl: unknown): { ok: { durationSec: number } } | { error: string } {
  const sec = Number((voice as any)?.durationSec);
  if (!Number.isFinite(sec) || sec < 0.5) return { error: 'That voice message is empty' };
  if (sec > VOICE_MAX_SEC + 1) return { error: 'Voice messages can be up to 5 minutes' };
  const path = typeof mediaUrl === 'string' ? mediaUrl.split('?')[0] : '';
  if (!AUDIO_FILE.test(path)) return { error: "That isn't an audio recording" };
  return { ok: { durationSec: Math.min(VOICE_MAX_SEC, Math.max(1, Math.round(sec))) } };
}

// ── Shared location ──────────────────────────────────────────────────────────

export type LatLng = { lat: number; lng: number };

/** A real point on the map, rounded to about 10 cm; null when it isn't one. */
export function cleanLocation(loc: unknown): LatLng | null {
  const lat = Number((loc as any)?.lat);
  const lng = Number((loc as any)?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null; // a phone with no fix reports 0,0
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return { lat: r(lat), lng: r(lng) };
}

export function mapsUrl(p: LatLng): string {
  return `https://www.google.com/maps?q=${p.lat},${p.lng}`;
}

/** The text stored with a location (what older phone builds show: a tappable link). */
export function locationText(p: LatLng): string {
  return `📍 Location: ${mapsUrl(p)}`;
}

// ── Several photos at once ───────────────────────────────────────────────────

export const ALBUM_MAX = 10;

export type AlbumItem = { mediaUrl: string; messageType: 'image' | 'video' };

/** The photos/videos to send together, or an error for the person. */
export function cleanAlbum(album: unknown): { ok: AlbumItem[] } | { error: string } {
  if (!Array.isArray(album) || album.length < 2) return { error: 'An album needs at least 2 photos' };
  if (album.length > ALBUM_MAX) return { error: `You can send up to ${ALBUM_MAX} photos at a time` };
  const items: AlbumItem[] = [];
  for (const a of album) {
    const type = (a as any)?.messageType === 'video' ? 'video' : (a as any)?.messageType === 'image' ? 'image' : null;
    if (!type) return { error: 'Albums hold photos and videos only' };
    const url = typeof (a as any)?.mediaUrl === 'string' ? (a as any).mediaUrl.trim() : '';
    if (attachmentProblem(type, url) || /giphy\.com/i.test(url)) return { error: "That attachment isn't allowed" };
    items.push({ mediaUrl: url, messageType: type });
  }
  return { ok: items };
}

/** Alert text for an album: "📷 3 photos", "📷 2 photos and a video", ... */
export function albumPreview(items: { messageType: string }[]): string {
  const videos = items.filter((i) => i.messageType === 'video').length;
  const photos = items.length - videos;
  const part = (n: number, one: string, many: string) => (n === 1 ? `a ${one}` : `${n} ${many}`);
  if (!videos) return `📷 ${part(photos, 'photo', 'photos')}`;
  if (!photos) return `🎬 ${part(videos, 'video', 'videos')}`;
  return `📷 ${part(photos, 'photo', 'photos')} and ${part(videos, 'video', 'videos')}`;
}

// ── Polls: end date and who voted ────────────────────────────────────────────

export const POLL_MAX_DAYS = 30;

/** The end time to store (null = no end), or an error for the person. */
export function cleanPollEnd(endsAt: unknown, now = Date.now()): { ok: Date | null } | { error: string } {
  if (endsAt === undefined || endsAt === null || endsAt === '') return { ok: null };
  const t = new Date(endsAt as any).getTime();
  if (Number.isNaN(t)) return { error: "That end time isn't a date" };
  if (t < now + 60_000) return { error: 'A poll has to stay open for at least a minute' };
  if (t > now + POLL_MAX_DAYS * 24 * 60 * 60 * 1000) return { error: `A poll can stay open for up to ${POLL_MAX_DAYS} days` };
  return { ok: new Date(t) };
}

export function pollEnded(poll: { endsAt?: unknown } | null | undefined, now = Date.now()): boolean {
  if (!poll?.endsAt) return false;
  const t = new Date(poll.endsAt as any).getTime();
  return !Number.isNaN(t) && t <= now;
}

type PollIn = {
  question?: unknown;
  allowMultiple?: unknown;
  anonymous?: unknown;
  endsAt?: unknown;
  options?: { text?: unknown; votes?: unknown[] }[];
};

/**
 * The poll as this viewer may see it. Votes are stored by app id. In an
 * anonymous poll nobody's id is sent except the viewer's own (so the counts
 * and their own tick still work); otherwise each option also lists
 * `voterNames`.
 */
export function pollForViewer<T extends PollIn>(poll: T, viewerAppId: string, nameOf: (appId: string) => string | undefined): T & { voterCount: number } {
  const everyone = new Set<string>();
  const options = (poll.options || []).map((o, i) => {
    const votes = (o.votes || []).map(String);
    votes.forEach((v) => everyone.add(v));
    // Placeholders stay distinct so counting them still works.
    if (poll.anonymous) return { ...o, votes: votes.map((v, j) => (v === viewerAppId ? v : `hidden-${i}-${j}`)) };
    return { ...o, votes, voterNames: votes.map((v) => (v === viewerAppId ? 'You' : nameOf(v) || 'Former user')) };
  });
  // How many people voted (one person can pick several options).
  return { ...poll, options, voterCount: everyone.size };
}
