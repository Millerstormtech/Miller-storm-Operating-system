import { useEffect, useState } from "react";
import { PODIUM, MEDALS, GREEN, RING_TRACK } from "./constants";
import { CREDENTIALS, type CredentialProgress } from "../../../lib/training/credentials";
import { ProgressRing, Avatar } from "./RepCard";
import { Tooltip } from "./Tooltip";

// Condensed brand heading font, matching the rest of the redesigned panels.
const HEAD_FONT = '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';

type RepCourse = {
  id: string;
  title: string;
  videosTotal: number;
  videosWatched: number;
  quizzesTotal: number;
  quizzesPassed: number;
  pct: number;
  complete: boolean;
  started: boolean;
};

type RepDetail = {
  id: string;
  name: string;
  headshotUrl: string;
  branch: string;
  team: string;
  rank: number | null;
  isPodium: boolean;
  pct: number;
  itemsCompleted: number;
  totalItems: number;
  coursesCompleted: number;
  totalCourses: number;
  credentials?: CredentialProgress[];
  courses: RepCourse[];
};

/**
 * Click-in rep detail (spec 2026-07-23 §3): anyone can open anyone. Fetches
 * on open; the board payload stays light. Courses are ordered complete first,
 * then in progress (highest pct first), then not started, matching the
 * approved mockup. Unearned credentials are greyed with their progress in
 * the tooltip.
 *
 * Brand redesign: red gradient header + carded sections, driven entirely by
 * semantic tokens so it reads correctly in both light and dark mode.
 */
export function RepDetailModal({ repId, onClose }: { repId: string; onClose: () => void }) {
  const [data, setData] = useState<RepDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  // Stale-response guard: a late response for a previously opened rep must
  // never paint over the current one.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetch(`/api/training/rep/${repId}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repId, retryNonce]);

  // Escape closes (spec §3.1); × and backdrop click handled inline below.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const orderedCourses = data
    ? [
        ...data.courses.filter((c) => c.complete),
        ...data.courses.filter((c) => !c.complete && c.started).sort((a, b) => b.pct - a.pct),
        ...data.courses.filter((c) => !c.complete && !c.started),
      ]
    : [];

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "var(--surface-default)",
          borderRadius: 18,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
          border: "1px solid var(--border-default)",
          overflow: "hidden",
        }}
      >
        {/* Brand red header. */}
        <div
          style={{
            padding: "16px 22px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "linear-gradient(135deg, #e01418 0%, #b30002 100%)",
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: 19,
              color: "#fff",
              fontFamily: HEAD_FONT,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            Rep Detail
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "rgba(255,255,255,0.18)",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              color: "#fff",
              lineHeight: 1,
              width: 30,
              height: 30,
              borderRadius: 999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>Loading…</div>
          ) : loadError || !data ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
              Couldn't load this rep.{" "}
              <button
                onClick={() => setRetryNonce((n) => n + 1)}
                style={{
                  border: "none",
                  background: "none",
                  color: "#e01418",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {/* Identity card. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px",
                  background: "var(--surface-subtle)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 14,
                }}
              >
                <Avatar name={data.name} headshotUrl={data.headshotUrl} size={52} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)", fontFamily: HEAD_FONT, letterSpacing: 0.2 }}>
                    {data.name}{" "}
                    {data.isPodium && (
                      <Tooltip text={`${PODIUM.label}: ${PODIUM.meaning}`}>
                        <span style={{ fontSize: 13, marginLeft: 4 }}>{PODIUM.emoji}</span>
                      </Tooltip>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                    {[
                      [data.branch, data.team && `Team ${data.team}`].filter(Boolean).join(" · "),
                      data.rank !== null
                        ? `${data.rank <= 3 ? MEDALS[data.rank - 1] + " " : ""}Rank #${data.rank}`
                        : "Not started",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 2 }}>
                    {data.itemsCompleted} of {data.totalItems} items · {data.coursesCompleted} of{" "}
                    {data.totalCourses} courses finished
                  </div>
                </div>
                <ProgressRing pct={data.pct} size={56} />
              </div>

              {/* The three credentials, replacing the four badges retired on
                  2026-08-15. Each percentage counts only that credential's own
                  courses, which is why they do not add up to the ring above. */}
              {data.credentials && data.credentials.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
                  {data.credentials.map((c) => {
                    const meta = CREDENTIALS.find((m) => m.key === c.key);
                    const label = meta?.label || c.key;
                    return (
                      <Tooltip
                        key={c.key}
                        text={
                          c.earned
                            ? `${label}: earned`
                            : `${label}: ${c.coursesCompleted} of ${c.coursesTotal} courses complete`
                        }
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 11px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            background: c.earned ? "rgba(202,0,2,0.14)" : "var(--surface-subtle)",
                            color: c.earned ? "#ca0002" : "var(--text-subtle)",
                            border: c.earned ? "1px solid rgba(202,0,2,0.4)" : "1px solid var(--border-default)",
                            opacity: c.earned ? 1 : 0.75,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: 11,
                              height: 11,
                              borderRadius: 3,
                              flexShrink: 0,
                              background: c.earned ? "#ca0002" : "transparent",
                              border: `1.5px solid ${c.earned ? "#ca0002" : "var(--border-default)"}`,
                            }}
                          />
                          {label} {c.pct}%
                        </span>
                      </Tooltip>
                    );
                  })}
                </div>
              )}

              {/* Section label. */}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "var(--text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ width: 14, height: 2, background: "#e01418", borderRadius: 2 }} />
                Courses
              </div>

              {/* Course rows. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {orderedCourses.map((c) =>
                  c.complete ? (
                    <div
                      key={c.id}
                      style={{
                        padding: "11px 13px",
                        background: "rgba(16,185,129,0.12)",
                        border: "1px solid rgba(16,185,129,0.3)",
                        borderRadius: 12,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text-primary)" }}>🏁 {c.title}</span>
                        <span style={{ fontWeight: 800, fontSize: 12, color: "#10b981", flexShrink: 0 }}>Complete</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
                        🎬 {c.videosWatched}/{c.videosTotal} videos · ✅ {c.quizzesPassed}/{c.quizzesTotal} quizzes
                      </div>
                    </div>
                  ) : c.started ? (
                    <div
                      key={c.id}
                      style={{
                        padding: "11px 13px",
                        background: "var(--surface-subtle)",
                        border: "1px solid var(--border-default)",
                        borderRadius: 12,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text-primary)" }}>▶ {c.title}</span>
                        <span style={{ fontWeight: 800, fontSize: 12, color: "#e01418", flexShrink: 0 }}>{c.pct}%</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
                        🎬 {c.videosWatched}/{c.videosTotal} videos · ✅ {c.quizzesPassed}/{c.quizzesTotal} quizzes
                      </div>
                      <div style={{ height: 6, background: RING_TRACK, borderRadius: 3, marginTop: 8 }}>
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, c.pct))}%`,
                            height: 6,
                            background: GREEN,
                            borderRadius: 3,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div
                      key={c.id}
                      style={{
                        padding: "11px 13px",
                        borderRadius: 12,
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-muted)",
                        fontSize: 13,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{c.title}</span>
                      <span style={{ color: "var(--text-subtle)", flexShrink: 0 }}>Not started</span>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
