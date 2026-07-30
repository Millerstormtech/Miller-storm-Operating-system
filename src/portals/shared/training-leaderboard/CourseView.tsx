import { useEffect, useState } from "react";
import type { OverallRow, BoardFilters } from "../../../lib/training/board";
import { filterRows } from "../../../lib/training/board";
import { RepCard, type RepCardData } from "./RepCard";
import { NotStartedGroup } from "./NotStartedGroup";

type CourseRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  headshotUrl: string;
  done: number;
  total: number;
  pct: number;
};

/**
 * Minimal By Course view (spec §4): a course picker plus the same cards
 * filtered to that course. Reuses GET /api/leaderboard?courseId= untouched
 * (four Flutter screens depend on its shape). Badges, rank pill, podium,
 * branch and team are joined client-side from the Overall rows by user id.
 * Medals never appear here; the true company rank shows as "co.#X".
 */
export function CourseView({
  courses,
  overallById,
  filters,
  isNarrow,
  youId,
  hiddenIds,
  courseId,
  onCourseId,
  onRows,
}: {
  courses: Array<{ id: string; title: string }>;
  overallById: Map<string, OverallRow>;
  filters: BoardFilters;
  isNarrow: boolean;
  youId: string | null;
  hiddenIds: Set<string>;
  /** Owned by the parent so the Export report button can see which course is open. */
  courseId: string;
  onCourseId: (id: string) => void;
  /** Reports the rows this view is showing so the parent can export them. */
  onRows: (
    rows: Array<{ id: string; name: string; branch: string; team: string; done: number; total: number; pct: number }>
  ) => void;
}) {
  const [rows, setRows] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  // Guarded against races: if courseId changes again before this resolves,
  // the stale response is dropped instead of overwriting the newer course's rows.
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetch(`/api/leaderboard?courseId=${courseId}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows || []);
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
  }, [courseId, retryNonce]);

  const enriched = rows
    .filter((r) => !hiddenIds.has(r.id))
    .map((r) => {
      const overall = overallById.get(r.id);
      const card: RepCardData & { branch: string; team: string; done: number; total: number } = {
        id: r.id,
        name: r.name,
        headshotUrl: r.headshotUrl || "",
        branch: overall?.branch || "",
        team: overall?.team || "",
        pct: r.pct,
        rankTitle: overall?.rankTitle || "Rookie",
        badges: overall?.badges || [],
        isPodium: overall?.isPodium || false,
        videosWatched: overall?.videosWatched,
        quizzesPassed: overall?.quizzesPassed,
        done: r.done,
        total: r.total,
      };
      return { card, coRank: overall?.rank ?? null };
    });

  const filtered = filterRows(
    enriched.map((e) => ({ ...e, name: e.card.name, branch: e.card.branch, team: e.card.team })),
    filters
  );
  const started = filtered.filter((e) => e.card.done > 0);
  const notStarted = filtered
    .filter((e) => e.card.done === 0)
    .map((e) => ({ id: e.card.id, name: e.card.name, branch: e.card.branch, team: e.card.team }));

  // Report the rows upward so the parent's Export report button can use them.
  // Deliberately reports `enriched`, NOT `filtered`: the parent re-applies the
  // filters for a "This view" export, and needs the unfiltered set intact so
  // "Full board" really means the full board.
  const exportRows = enriched.map((e) => ({
    id: e.card.id,
    name: e.card.name,
    branch: e.card.branch,
    team: e.card.team,
    done: e.card.done,
    total: e.card.total ?? 0,
    pct: e.card.pct,
  }));
  const exportKey = exportRows.map((r) => `${r.id}:${r.done}/${r.total}`).join(",");
  useEffect(() => {
    onRows(exportRows);
    // exportKey stands in for deep equality on exportRows: reporting on every
    // render would loop, because the parent's setState re-renders this child.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportKey]);

  return (
    <div>
      <select
        value={courseId}
        onChange={(e) => onCourseId(e.target.value)}
        style={{
          width: "100%",
          padding: "9px 10px",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          fontSize: 13,
          background: "#fff",
          marginBottom: 6,
        }}
      >
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Loading…</div>
      ) : loadError ? (
        <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
          Couldn't load this course.{" "}
          <button
            onClick={() => setRetryNonce((n) => n + 1)}
            style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {started.map((e, i) => (
            <RepCard
              key={e.card.id}
              row={e.card}
              primaryRank={i + 1}
              coRank={e.coRank}
              isNarrow={isNarrow}
              youTag={e.card.id === youId}
            />
          ))}
          {started.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              Nobody has started this course yet.
            </div>
          )}
          <NotStartedGroup rows={notStarted} isNarrow={isNarrow} />
        </>
      )}
    </div>
  );
}
