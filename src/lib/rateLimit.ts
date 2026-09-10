import type { NextApiRequest } from "next";

// In-memory sliding-window rate limiter for the handful of unauthenticated
// endpoints that can be brute-forced (login, forgot-password, reset-password).
//
// Deliberately in-process and dependency-free: production runs ONE Next
// instance under PM2 (ecosystem.config.js `instances: 1`), so a Map in this
// process is the whole picture. If that ever becomes several instances, move
// the buckets to Mongo or Redis; until then this is exact and costs nothing.
//
// Keys are chosen by the caller (`login:ip:1.2.3.4`, `login:email:x@y`), so a
// route can throttle by address AND by target account at the same time: the
// per-IP bucket stops one machine hammering many accounts, the per-account
// bucket stops many machines hammering one account.

const buckets = new Map<string, number[]>();
let sweepCounter = 0;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) || []).filter((t) => t > cutoff);
  if (hits.length >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
    buckets.set(key, hits);
    return { ok: false, retryAfterSec };
  }
  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic sweep so an attacker rotating keys cannot grow the map
  // without bound: every 500 calls drop buckets with no live hits.
  if (++sweepCounter % 500 === 0) {
    for (const [k, v] of buckets) {
      if (!v.some((t) => t > cutoff)) buckets.delete(k);
    }
  }
  return { ok: true };
}

// The client address as nginx saw it. Production sits behind nginx, which sets
// X-Forwarded-For; the first entry is the caller. Fall back to the socket.
export function clientIp(req: NextApiRequest): string {
  const xff = req.headers["x-forwarded-for"];
  const first = (Array.isArray(xff) ? xff[0] : xff || "").split(",")[0].trim();
  return first || req.socket?.remoteAddress || "unknown";
}

// Test hook only.
export function _resetRateLimits(): void {
  buckets.clear();
}
