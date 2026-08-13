import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { getSeenVersion, markSeen, shouldAutoStart } from "./storage";
import {
  CARD_WIDTH, choosePlacement, isPhoneWidth, isVisible, positionCard, spotlightRect,
} from "./placement";
import {
  firstIndex, isLastIndex, nextIndex, prevIndex, stepPosition, visibleStepIndexes, type Measure,
} from "./steps";
import { registerTour, subscribeToRestart } from "./tourRegistry";
import type { Rect, TourDefinition } from "./types";

/** Finds a data-tour target. Several elements can share one marker (the
 *  Training Center renders a desktop and a mobile lesson body), so this returns
 *  the first one that is actually on screen. */
const measure: Measure = (target) => {
  if (typeof document === "undefined") return null;
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const node of Array.from(nodes)) {
    const r = node.getBoundingClientRect();
    const rect: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };
    if (isVisible(rect)) return rect;
  }
  return null;
};

function scrollTargetIntoView(target: string) {
  if (typeof document === "undefined") return;
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const node of Array.from(nodes)) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
  }
}

export function GuidedTour({ tour, ready = true }: { tour: TourDefinition; ready?: boolean }) {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<number | null>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardSize, setCardSize] = useState({ width: CARD_WIDTH, height: 160 });
  // Which tour id we have already auto-started for. Keyed by id, not a plain
  // boolean: a screen can swap one tour for another at the same position in the
  // tree (the Training Center swaps its library tour for its course tour), and
  // React reuses the component instance rather than remounting it. A boolean
  // would survive that swap and silently suppress the second tour.
  const autoStartedFor = useRef<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Tell PageHeader a tour lives on this page, so it can show the "?".
  // registerTour returns its own unregister function, so it doubles as the
  // effect cleanup.
  useEffect(() => registerTour(tour.id), [tour.id]);

  const visible = useMemo(() => {
    if (!mounted || !open) return [];
    return visibleStepIndexes(tour.steps, measure);
  }, [mounted, open, tour.steps, targetRect]);

  const finish = useCallback(() => {
    setOpen(false);
    setIndex(null);
    if (userId) markSeen(tour.id, userId, tour.version);
  }, [tour.id, tour.version, userId]);

  const start = useCallback(() => {
    const candidates = visibleStepIndexes(tour.steps, measure);
    const first = firstIndex(candidates);
    // No target resolved: do not run and do not record, so it retries next visit.
    if (first === null) return;
    setOpen(true);
    setIndex(first);
    // Record "seen" the MOMENT the tour opens, not only when the user reaches
    // Done/Skip/Escape. Logins land on a page with the tour, and a user who
    // clicks a nav link (a client-side route change unmounts this before
    // finish() can run) would otherwise never be recorded — so the tour would
    // auto-start again on every login. finish() still marks seen too; a repeat
    // write of the same version is harmless.
    if (userId) markSeen(tour.id, userId, tour.version);
  }, [tour.steps, tour.id, tour.version, userId]);

  // Auto-start once per user per version, and only once data has landed.
  useEffect(() => {
    if (!mounted || !ready || !userId) return;
    if (autoStartedFor.current === tour.id) return;
    if (!shouldAutoStart(getSeenVersion(tour.id, userId), tour.version)) return;
    autoStartedFor.current = tour.id;
    start();
  }, [mounted, ready, userId, tour.id, tour.version, start]);

  // The "?" replays from step 1 regardless of seen state. subscribeToRestart
  // also returns its own unsubscribe, so it is returned directly.
  useEffect(() => subscribeToRestart(() => { autoStartedFor.current = tour.id; start(); }), [start, tour.id]);

  // Measure the active step: scroll it to the middle, then settle before placing
  // the card, so a smooth scroll does not leave the card behind.
  useEffect(() => {
    if (!open || index === null) return;
    const step = tour.steps[index];
    if (!step) return;
    scrollTargetIntoView(step.target);

    let raf = 0;
    let stableFrames = 0;
    let last: Rect | null = null;

    const tick = () => {
      const rect = measure(step.target);
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      if (!rect) {
        // Target vanished mid-tour: move on, or end cleanly if nothing is left.
        const candidates = visibleStepIndexes(tour.steps, measure);
        const nxt = nextIndex(index, candidates);
        if (nxt === null) finish();
        else setIndex(nxt);
        return;
      }
      if (last && rect.top === last.top && rect.left === last.left && rect.width === last.width && rect.height === last.height) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
      }
      last = rect;
      setTargetRect(rect);
      if (stableFrames < 2) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, index, tour.steps, finish]);

  // Watchdog: a target can disappear without any scroll or resize (a filter
  // empties a table, a panel closes, a role-gated control unmounts). Without
  // this, the card would keep pointing at a stale rectangle, so re-check the
  // current target on a slow tick and let the measure effect move on.
  useEffect(() => {
    if (!open || index === null) return;
    const step = tour.steps[index];
    if (!step) return;
    const id = setInterval(() => {
      const rect = measure(step.target);
      if (rect) return;
      const candidates = visibleStepIndexes(tour.steps, measure);
      const nxt = nextIndex(index, candidates);
      if (nxt === null) finish();
      else setIndex(nxt);
    }, 500);
    return () => clearInterval(id);
  }, [open, index, tour.steps, finish]);

  // Keep the spotlight glued to the target through resize and scroll.
  useEffect(() => {
    if (!open || index === null) return;
    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const step = tour.steps[index];
        if (!step) return;
        setTargetRect(measure(step.target));
        setViewport({ width: window.innerWidth, height: window.innerHeight });
      });
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, index, tour.steps]);

  // Measure the card so placement can react to its real height.
  useEffect(() => {
    if (!open || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    if (r.height > 0 && Math.abs(r.height - cardSize.height) > 1) {
      setCardSize({ width: r.width || CARD_WIDTH, height: r.height });
    }
  }, [open, index, cardSize.height]);

  const goNext = useCallback(() => {
    if (index === null) return;
    const nxt = nextIndex(index, visible);
    if (nxt === null) finish();
    else setIndex(nxt);
  }, [index, visible, finish]);

  const goBack = useCallback(() => {
    if (index === null) return;
    const prv = prevIndex(index, visible);
    if (prv !== null) setIndex(prv);
  }, [index, visible]);

  // Keyboard: arrows navigate, Escape leaves and counts as seen.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); finish(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goBack(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goNext, goBack, finish]);

  useEffect(() => {
    if (open && cardRef.current) cardRef.current.focus();
  }, [open, index]);

  if (!mounted || !open || index === null || !targetRect) return null;

  const step = tour.steps[index];
  if (!step) return null;

  const phone = isPhoneWidth(viewport.width);
  const spot = spotlightRect(targetRect);
  const placement = choosePlacement(targetRect, cardSize, viewport, step.placement);
  const pos = positionCard(targetRect, cardSize, viewport, placement);
  const counter = stepPosition(index, visible);
  const last = isLastIndex(index, visible);

  const cardStyle: CSSProperties = phone
    ? {
        position: "fixed", left: 12, right: 12, bottom: 12, width: "auto",
        maxWidth: "none", zIndex: 1300,
      }
    : {
        position: "fixed", top: pos.top, left: pos.left, width: CARD_WIDTH,
        maxWidth: CARD_WIDTH, zIndex: 1300,
      };

  return (
    <>
      {/* Swallows clicks so a stray click on the dark area cannot kill the tour. */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1290 }} />

      {/* The spotlight carries the veil: an oversized shadow darkens everything
          outside this rectangle in one element. */}
      <div
        style={{
          position: "fixed",
          top: spot.top, left: spot.left, width: spot.width, height: spot.height,
          borderRadius: 10,
          boxShadow: "0 0 0 9999px rgb(var(--surface-inverse-rgb) / 0.6)",
          pointerEvents: "none",
          zIndex: 1295,
        }}
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        tabIndex={-1}
        style={{
          ...cardStyle,
          background: "var(--surface-default)",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
          padding: 16,
          outline: "none",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{step.title}</div>
          <div style={{ fontSize: 11, color: "var(--text-subtle)", flexShrink: 0, paddingTop: 2 }}>
            {counter.current} of {counter.total}
          </div>
        </div>
        {Array.isArray(step.body) ? (
          <ul
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              margin: "6px 0 0",
              paddingLeft: 17,
              lineHeight: 1.45,
            }}
          >
            {step.body.map((line) => (
              <li key={line} style={{ marginBottom: 3 }}>
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>{step.body}</div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={finish}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", padding: 0 }}
          >
            Skip tour
          </button>

          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {visible.map((i) => (
              <span
                key={i}
                style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: i === index ? "#6366f1" : "var(--surface-muted)",
                  display: "inline-block",
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {prevIndex(index, visible) !== null ? (
              <button
                type="button"
                onClick={goBack}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "var(--surface-default)", color: "var(--text-tertiary)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={goNext}
              style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#6366f1", color: "var(--text-inverse)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
