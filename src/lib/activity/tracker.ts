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

const STEP = 5;        // seconds counted per tick
const FLUSH_MS = 30000; // send accumulated seconds every 30s

// Set by the lesson viewer while a video / quiz is on screen; cleared on leave.
export function setActivityContext(next: Ctx) { ctx = next; }
export function clearActivityContext() { ctx = { kind: "app" }; }

function reset() {
  appSec = 0; videoMap.clear(); quizMap.clear();
}

// Add STEP seconds to the page the rep is currently on within a video/quiz map.
function bump(map: Map<string, Item>) {
  if (!ctx.pageId) return;
  const cur = map.get(ctx.pageId) || { courseId: ctx.courseId || "", pageId: ctx.pageId, title: ctx.title || "", seconds: 0 };
  cur.seconds += STEP;
  cur.title = ctx.title || cur.title;
  cur.courseId = ctx.courseId || cur.courseId;
  map.set(ctx.pageId, cur);
}

function tick() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  if (!getToken()) return; // not signed in — count nothing
  appSec += STEP;
  if (ctx.kind === "video") bump(videoMap);
  else if (ctx.kind === "quiz") bump(quizMap);
}

function dominant(map: Map<string, Item>): Item | null {
  let best: Item | null = null;
  for (const v of map.values()) if (!best || v.seconds > best.seconds) best = v;
  return best;
}

function flush(keepalive = false) {
  if (!getToken()) { reset(); return; }
  if (appSec === 0 && videoMap.size === 0 && quizMap.size === 0) return;
  // One video/quiz per flush is the normal case (context is a single lesson at a
  // time). video/quiz seconds are derived server-side from these items.
  const payload = { platform: "web", appSeconds: appSec, video: dominant(videoMap), quiz: dominant(quizMap) };
  reset();
  try {
    fetch("/api/activity/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive,
    }).catch(() => {});
  } catch { /* ignore */ }
}

// Start the heartbeat once. Safe to call repeatedly.
export function startActivityBeacon() {
  if (started || typeof window === "undefined") return;
  started = true;
  setInterval(tick, STEP * 1000);
  setInterval(() => flush(false), FLUSH_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", () => flush(true));
}
