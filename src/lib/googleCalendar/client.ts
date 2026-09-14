// Google Calendar OAuth + REST access — hand-rolled (no `googleapis` SDK),
// matching this codebase's existing style for third-party integrations (see
// src/lib/acculynx/client.ts): plain fetch, a timeout per request, and a
// thrown Error("<Provider> <status> on <path>: ...") on failure. Calendar
// reads are on-demand for one user at a time (not a bulk sync), so none of
// AccuLynx's per-key rate-limit pacing is needed here.
//
// Scope is calendar.readonly — this app only ever DRAWS a person's calendar,
// never creates/edits events on their behalf.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/** The Google consent-screen URL to redirect the browser to. */
export function authUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    redirect_uri: requireEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // Forces Google to hand back a refresh_token on every consent, not just
    // the very first one — without this, reconnecting after a revoke would
    // silently come back with no refresh_token and break after ~1 hour.
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
    });
  } catch (err: any) {
    throw new Error(`Google Calendar token request failed: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`Google Calendar ${res.status} on /token: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

/** Exchanges the one-time `code` from the callback for an access+refresh token. */
export function exchangeCode(code: string): Promise<TokenSet> {
  return tokenRequest({
    code,
    client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
    redirect_uri: requireEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
    grant_type: "authorization_code",
  });
}

/** A fresh access token from a stored refresh token. Google does not resend
 * refresh_token here — the caller keeps using the one it already has. */
export function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO datetime, or an all-day event's ISO date (YYYY-MM-DD). */
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  htmlLink: string;
}

/** Upcoming events on the person's primary calendar, soonest first. */
export async function listUpcomingEvents(
  accessToken: string,
  { timeMin, timeMax, maxResults = 50 }: { timeMin: string; timeMax: string; maxResults?: number }
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin, timeMax,
    maxResults: String(maxResults),
    singleEvents: "true", // expands recurring events into individual instances
    orderBy: "startTime",
  });
  const path = `/calendars/primary/events?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${CALENDAR_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
  } catch (err: any) {
    throw new Error(`Google Calendar request failed on ${path}: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`Google Calendar ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const items = (data.items ?? []) as any[];
  return items
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      id: e.id,
      title: e.summary || "(No title)",
      start: e.start?.dateTime || e.start?.date || "",
      end: e.end?.dateTime || e.end?.date || "",
      allDay: !e.start?.dateTime,
      location: e.location || null,
      htmlLink: e.htmlLink,
    }));
}
