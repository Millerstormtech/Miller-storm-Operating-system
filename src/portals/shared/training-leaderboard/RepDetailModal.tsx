import { useEffect, useState } from "react";
import type { BadgeId, RankTitle } from "../../../lib/training/scoring";
import { BADGE_META, PODIUM, TIER_COLORS, MEDALS, GREEN, RING_TRACK } from "./constants";
import { ProgressRing, Avatar } from "./RepCard";
import { Tooltip } from "./Tooltip";

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
  rankTitle: RankTitle;
  badges: BadgeId[];
  courses: RepCourse[];
};

/**
 * Click-in rep detail (spec 2026-07-23 §3): anyone can open anyone. Fetches
 * on open; the board payload stays light. Courses are ordered complete first,
 * then in progress (highest pct first), then not started, matching the
 * approved mockup. Locked badges are greyed with a how-to-earn tooltip.
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

  const tier = data ? TIER_COLORS[data.rankTitle] : null;
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
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f8fafc",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>Rep detail</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: "#9ca3af",
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Loading…</div>
          ) : loadError || !data ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              Couldn't load this rep.{" "}
              <button
                onClick={() => setRetryNonce((n) => n + 1)}
                style={{
                  border: "none",
                  background: "none",
                  color: "#2563eb",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar name={data.name} headshotUrl={data.headshotUrl} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>
                    {data.name}{" "}
                    {tier && (
                      <span
                        style={{
                          background: tier.bg,
                          color: tier.fg,
                          padding: "1px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 600,
                          verticalAlign: "middle",
                        }}
                      >
                        {data.rankTitle}
                      </span>
                    )}
                    {data.isPodium && (
                      <Tooltip text={`${PODIUM.label}: ${PODIUM.meaning}`}>
                        <span style={{ fontSize: 13, marginLeft: 4 }}>{PODIUM.emoji}</span>
                      </Tooltip>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
                    {[data.branch, data.team && `Team ${data.team}`].filter(Boolean).join(" · ")}
                    {data.rank !== null
                      ? ` · ${data.rank <= 3 ? MEDALS[data.rank - 1] + " " : ""}Rank #${data.rank}`
                      : " · Not started"}
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                    {data.itemsCompleted} of {data.totalItems} items · {data.coursesCompleted} of{" "}
                    {data.totalCourses} courses finished
                  </div>
                </div>
                <ProgressRing pct={data.pct} size={52} />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "14px 0" }}>
                {(Object.keys(BADGE_META) as BadgeId[]).map((b) => {
                  const meta = BADGE_META[b];
                  const earned = data.badges.includes(b);
                  return (
                    <Tooltip key={b} text={`${meta.label}: ${meta.meaning}`}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "3px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          background: earned ? "#f0fdf4" : "#f3f4f6",
                          color: earned ? "#166534" : "#9ca3af",
                          border: earned ? "1px solid #bbf7d0" : "1px solid #e5e7eb",
                          opacity: earned ? 1 : 0.6,
                        }}
                      >
                        {meta.emoji} {meta.label}
                      </span>
                    </Tooltip>
                  );
                })}
              </div>

              {orderedCourses.map((c) =>
                c.complete ? (
                  <div
                    key={c.id}
                    style={{ padding: "9px 11px", background: "#f0fdf4", borderRadius: 8, marginBottom: 4 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>🏁 {c.title}</span>
                      <span style={{ fontWeight: 700, fontSize: 12, color: "#059669", flexShrink: 0 }}>
                        Complete
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
                      🎬 {c.videosWatched}/{c.videosTotal} videos · ✅ {c.quizzesPassed}/{c.quizzesTotal} quizzes
                    </div>
                  </div>
                ) : c.started ? (
                  <div
                    key={c.id}
                    style={{ padding: "9px 11px", background: "#fafafa", borderRadius: 8, marginBottom: 4 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>▶ {c.title}</span>
                      <span style={{ fontWeight: 700, fontSize: 12, color: "#374151", flexShrink: 0 }}>
                        {c.pct}%
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
                      🎬 {c.videosWatched}/{c.videosTotal} videos · ✅ {c.quizzesPassed}/{c.quizzesTotal} quizzes
                    </div>
                    <div style={{ height: 5, background: RING_TRACK, borderRadius: 3, marginTop: 6 }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, c.pct))}%`,
                          height: 5,
                          background: GREEN,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    key={c.id}
                    style={{ padding: "9px 11px", borderRadius: 8, marginBottom: 4, color: "#9ca3af", fontSize: 13 }}
                  >
                    {c.title} · Not started
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
