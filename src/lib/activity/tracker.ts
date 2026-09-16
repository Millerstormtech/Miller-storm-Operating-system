import { getToken } from "../authToken";

// Client-side usage tracker (web). Counts ONLY the seconds this page is open and
// focused, and reports them to /api/activity/ping in small batches. A shared
// "context" says what the rep is doing right now — plain app use, watching a
// training video, or taking a quiz — so the same heartbeat feeds all three
// totals plus the per-video breakdown. STRICTLY app usage; nothing device-wide.

type Ctx = { kind: "app" | "video" | "quiz"; courseId?: string; pageId?: string; title?: string };

type Item = { courseId: string; pageId: string; title: string; seconds: number };

let ctx: Ctx = { kind: "app" };
let appSec = 0;
const videoMap = new Map<string, Item>();
const quizMap = new Map<string, Item>();
let started = false;

// Wall-clock start (ms epoch) of the current visible/signed-in accounting
// period, or null while hidden/signed-out. Comparing real elapsed time
// against this — instead of only counting whole STEP ticks — means a
// session that ends after 1 second still banks that 1 second instead of
// being dropped for never reaching a tick boundary.
let periodStart: number | null = null;

const STEP = 5;        // heartbeat resolution, in seconds
const FLUSH_MS = 30000; // send accumulated seconds every 30s
const MAX_ACCUMULATE_SEC = 60; // guard against a huge dump after e.g. laptop sleep

// Set by the lesson viewer while a video / quiz is on screen; cleared on leave.
export function setActivityContext(next: Ctx) {
  accumulate(); // bank time under the previous context before switching
  ctx = next;
}
export function clearActivityContext() {
  accumulate();
  ctx = { kind: "app" };
}

function reset() {
  appSec = 0; videoMap.clear(); quizMap.clear();
}

// Add secs to the page the rep is currently on within a video/quiz map.
function bump(map: Map<string, Item>, secs: number) {
  if (!ctx.pageId || secs <= 0) return;
  const cur = map.get(ctx.pageId) || { courseId: ctx.courseId || "", pageId: ctx.pageId, title: ctx.title || "", seconds: 0 };
  cur.seconds += secs;
  cur.title = ctx.title || cur.title;
  cur.courseId = ctx.courseId || cur.courseId;
  map.set(ctx.pageId, cur);
}

// Bank whatever real time elapsed since the last accounting point, however
// short. This is what guarantees a session that lasts only 1 second still
// gets credited instead of being silently rounded down to zero.
function accumulate() {
  const visible = typeof document === "undefined" || document.visibilityState === "visible";
  if (!visible || !getToken()) { periodStart = null; return; }
  const now = Date.now();
  if (periodStart == null) { periodStart = now; return; }
  const elapsedMs = now - periodStart;
  periodStart = now;
  if (elapsedMs <= 0) return;
  const elapsedSec = Math.min(Math.max(Math.round(elapsedMs / 1000), 1), MAX_ACCUMULATE_SEC);
  appSec += elapsedSec;
  if (ctx.kind === "video") bump(videoMap, elapsedSec);
  else if (ctx.kind === "quiz") bump(quizMap, elapsedSec);
  console.log(`[ActivityTracker] Accumulate: +${elapsedSec}s appSec=${appSec}, ctx=${ctx.kind}, videos=${videoMap.size}, quizzes=${quizMap.size}`);
}

function flush(keepalive = false) {
  accumulate(); // capture any partial time since the last tick before sending
  if (!getToken()) { reset(); return; }
  if (appSec === 0 && videoMap.size === 0 && quizMap.size === 0) return;
  // Every video/quiz touched since the last flush is reported — not just the
  // one with the most time — so switching between lessons within a single
  // flush window no longer silently drops the others.
  const payload = {
    platform: "web",
    appSeconds: appSec,
    videos: Array.from(videoMap.values()),
    quizzes: Array.from(quizMap.values()),
  };
  console.log(`[ActivityTracker] Flushing:`, payload);
  reset();
  try {
    fetch("/api/activity/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive,
    }).then(r => {
      console.log(`[ActivityTracker] Ping response:`, r.status, r.ok);
    }).catch((err) => {
      console.error(`[ActivityTracker] Ping failed:`, err);
    });
  } catch (err) {
    console.error(`[ActivityTracker] Ping exception:`, err);
  }
}

// Start the heartbeat once. Safe to call repeatedly.
export function startActivityBeacon() {
  if (started || typeof window === "undefined") return;
  console.log(`[ActivityTracker] Starting activity beacon...`);
  started = true;
  periodStart = document.visibilityState === "visible" ? Date.now() : null;
  setInterval(accumulate, STEP * 1000);
  setInterval(() => flush(false), FLUSH_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush(true); // banks time up to now, then accumulate() clears periodStart
    } else {
      periodStart = Date.now(); // resumed visible — start a fresh period
    }
  });
  window.addEventListener("pagehide", () => flush(true));
  console.log(`[ActivityTracker] Activity beacon started! Tick every ${STEP}s, flush every ${FLUSH_MS/1000}s`);
}
