import { useEffect, useMemo, useState, useRef } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { isRankedRole } from "../../../lib/training/scoring";
import type { BoardFilters, OverallResponse, OverallRow } from "../../../lib/training/board";
import { teamSummaryFor, filterRows, filtersActive, teamStandings } from "../../../lib/training/board";
import { ExportReportButton, type ExportRequest, type ExportScope } from "../../../components/report/ExportReportButton";
import {
  buildCourseByCourseReport,
  buildCourseOverallReport,
  courseOverallFields,
  courseOverallTitle,
  type CourseRowInput,
} from "../../../lib/report/courseBoard";
import { resolveTeam, TEAM_BRANCH, resolveNameBranch } from "../../../lib/repcard/org-chart";
import { useIsNarrow } from "./useIsNarrow";
import { Legend } from "./Legend";
import { FiltersBar } from "./FiltersBar";
import { RosterGrid } from "./RosterGrid";
import { CourseView } from "./CourseView";
import { YourRankStrip } from "./YourRankStrip";
import { MyTeamSummary } from "./MyTeamSummary";
import { TeamStandings } from "./TeamStandings";
import { AdminMenu } from "./AdminMenu";
import { OverrideModal } from "./OverrideModal";
import { HideModal } from "./HideModal";
import { RepDetailModal } from "./RepDetailModal";
import { GuidedTour } from "../guided-tour/GuidedTour";
import { COURSE_LEADERBOARD_TOUR } from "../guided-tour/definitions/courseLeaderboard";

/**
 * The Course Leaderboard (Overall board + minimal By Course view). Mounted by
 * all five role shells; role behavior comes from AuthContext, not props:
 *   sales           -> your-rank strip
 *   sales-team-lead -> your-rank strip + your-team card
 *   branch-manager  -> branch filter pre-set to their branch (can widen)
 *   admin           -> ⋯ menu (Override, Hide)
 *   c-level         -> view only
 */
export function TrainingLeaderboard() {
  const { user } = useAuth();
  const isNarrow = useIsNarrow();

  const [data, setData] = useState<OverallResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState<"overall" | "course">("overall");
  const [filters, setFilters] = useState<BoardFilters>({ search: "", branch: "", team: "" });
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [showOverride, setShowOverride] = useState(false);
  const [showHide, setShowHide] = useState(false);
  const [detailRepId, setDetailRepId] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  // Lifted out of CourseView so the Export report button can see which course
  // is open and which rows it loaded.
  const [courseId, setCourseId] = useState("");
  const [courseRows, setCourseRows] = useState<CourseRowInput[]>([]);

  const isAdmin = user?.role === "admin";

  async function loadBoard() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/training/leaderboard?scope=overall");
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBoard();
  }, []);

  // Per-admin hidden users pref (admins only).
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/ui-prefs?key=hiddenLeaderboardUsers")
      .then((r) => (r.ok ? r.json() : { hiddenIds: [] }))
      .then((d) => setHiddenIds(new Set(d.hiddenIds || [])))
      .catch(() => {});
  }, [isAdmin]);

  async function saveHidden(newSet: Set<string>) {
    const previous = hiddenIds;
    setHiddenIds(newSet);
    setPrefsError(null);
    try {
      const res = await fetch("/api/admin/ui-prefs?key=hiddenLeaderboardUsers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenIds: [...newSet] }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      // Roll back so the screen never shows a state that did not persist.
      setHiddenIds(previous);
      setPrefsError("Couldn't save hidden users. Try again.");
    }
  }

  // Branch managers open on their own branch (they can widen). Resolved by
  // name via the org chart, same as every row's branch.
  useEffect(() => {
    if (user?.role !== "branch-manager") return;
    const team = resolveTeam(user.name);
    const branch = (team && TEAM_BRANCH[team]) || resolveNameBranch(user.name) || "";
    if (branch) setFilters((f) => ({ ...f, branch }));
  }, [user?.role, user?.name]);

  const allRows = useMemo(
    () => (data?.rows || []).filter((r) => !hiddenIds.has(r.id)),
    [data, hiddenIds]
  );
  const startedRows = useMemo(() => allRows.filter((r) => !r.notStarted), [allRows]);
  const notStartedRows = useMemo(() => allRows.filter((r) => r.notStarted), [allRows]);
  const overallById = useMemo(() => new Map(allRows.map((r) => [r.id, r] as [string, OverallRow])), [allRows]);

  const youRow = user && isRankedRole(user.role) ? allRows.find((r) => r.id === user.id) || null : null;
  const myTeam =
    user?.role === "sales-team-lead"
      ? teamSummaryFor(allRows, resolveTeam(user.name))
      : null;

  const branches = useMemo(
    () => [...new Set(allRows.map((r) => r.branch).filter(Boolean))].sort(),
    [allRows]
  );
  const teams = useMemo(
    () => [...new Set(allRows.map((r) => r.team).filter(Boolean))].sort(),
    [allRows]
  );

  // Company-wide team standings; a branch filter HIDES other branches' teams
  // but never renumbers ranks (same principle as rep medals).
  const standings = useMemo(() => teamStandings(allRows), [allRows]);
  const visibleStandings = useMemo(
    () =>
      filters.branch ? standings.filter((s) => TEAM_BRANCH[s.team] === filters.branch) : standings,
    [standings, filters.branch]
  );

  // Default to the first course once the board arrives (CourseView used to own this).
  useEffect(() => {
    if (!courseId && data?.courses?.length) setCourseId(data.courses[0].id);
  }, [data, courseId]);

  // ---- Export report -------------------------------------------------------
  const todayIso = new Date().toISOString().slice(0, 10);
  const courseTitle = data?.courses.find((c) => c.id === courseId)?.title || "";
  const visibleStarted = useMemo(() => filterRows(startedRows, filters), [startedRows, filters]);
  const visibleNotStarted = useMemo(() => filterRows(notStartedRows, filters), [notStartedRows, filters]);
  const visibleCourseRows = useMemo(() => filterRows(courseRows, filters), [courseRows, filters]);

  const exportViewCount = view === "overall" ? visibleStarted.length : visibleCourseRows.length;
  const exportBoardCount = view === "overall" ? startedRows.length : courseRows.length;

  function buildCourseExport(req: ExportRequest) {
    const useView = req.scope === "view";
    if (view === "overall") {
      return buildCourseOverallReport({
        rows: useView ? visibleStarted : startedRows,
        notStartedRows: useView ? visibleNotStarted : notStartedRows,
        filters,
        scope: req.scope,
        totalCourses: data?.totalCourses ?? 0,
        title: req.title,
        note: req.note,
        selectedKeys: req.selectedKeys,
        isoDate: todayIso,
      });
    }
    const rowsForCourse = useView ? visibleCourseRows : courseRows;
    return buildCourseByCourseReport({
      rows: rowsForCourse.filter((r) => r.done > 0),
      notStartedRows: rowsForCourse.filter((r) => r.done === 0),
      filters,
      scope: req.scope,
      courseTitle,
      title: req.title,
      note: req.note,
      selectedKeys: req.selectedKeys,
      isoDate: todayIso,
    });
  }

  function exportDefaultTitle(scope: ExportScope) {
    if (view === "course") return `Course Leaderboard: ${courseTitle}`;
    return courseOverallTitle(scope === "board" ? { search: "", branch: "", team: "" } : filters);
  }

  // The picker only reads `key` and `label`; buildCourse*Report rebuilds the
  // real value functions when the export runs.
  function exportFields(scope: ExportScope) {
    if (view === "course") {
      return [
        { key: "branch", label: "Branch", align: "left" as const, value: () => "" },
        { key: "team", label: "Team", align: "left" as const, value: () => "" },
        { key: "done", label: "Completed", align: "right" as const, value: () => "" },
        { key: "pct", label: "Progress", align: "right" as const, value: () => "" },
      ];
    }
    return courseOverallFields(scope === "view" && filtersActive(filters));
  }

  // The board shows its own title, so hide the layout's duplicate page-title
  // band on this page (restored on unmount). Self-contained — no layout edits.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let el: HTMLElement | null = rootRef.current;
    let band: HTMLElement | null = null;
    while (el && el.parentElement) {
      const prev = el.previousElementSibling as HTMLElement | null;
      const h1 = prev?.querySelector("h1");
      if (prev && h1 && /leaderboard/i.test(h1.textContent || "") && !prev.querySelector("table, form, input")) {
        band = prev;
        break;
      }
      el = el.parentElement;
    }
    if (band) {
      const d = band.style.display;
      band.style.display = "none";
      return () => { band!.style.display = d; };
    }
  }, []);

  if (!user) return null;

  return (
    <div className="clb" ref={rootRef}>
      {/* Board heading + view toggle — the board shows its own title (mockup). */}
      <div className="clb-head">
        <div className="clb-head-titles">
          <h1 className="clb-title">Course Leaderboard</h1>
        </div>
        <div className="clb-views" data-tour="clb-views-2">
          <button type="button" className={`clb-view${view === "overall" ? " on" : ""}`} onClick={() => setView("overall")}>Overall</button>
          <button type="button" className={`clb-view${view === "course" ? " on" : ""}`} onClick={() => setView("course")}>By course</button>
        </div>
      </div>
      {data && (
        <div className="clb-meta">
          Ranked across all {data.totalCourses} courses · {data.totalItems} lessons &amp; quizzes
        </div>
      )}

      <FiltersBar
        view={view}
        onView={setView}
        filters={filters}
        onFilters={setFilters}
        branches={branches}
        teams={teams}
        isNarrow={isNarrow}
        adminSlot={
          isAdmin ? <AdminMenu onOverride={() => setShowOverride(true)} onHide={() => setShowHide(true)} /> : undefined
        }
        exportSlot={
          // The marker goes on this local wrapper, NOT inside ExportReportButton:
          // that component is shared with the Sales Leaderboard, which must not
          // inherit a clb- marker. inline-flex keeps the box tight to the button
          // (display:contents would leave nothing for the tour to measure).
          <span data-tour="clb-export" style={{ display: "inline-flex" }}>
            <ExportReportButton
              viewCount={exportViewCount}
              boardCount={exportBoardCount}
              defaultTitle={exportDefaultTitle}
              fieldsFor={exportFields}
              buildDocument={buildCourseExport}
              disabledReason={loading ? "Still loading" : undefined}
            />
          </span>
        }
      />

      {prefsError && (
        <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 600, margin: "0 0 10px 2px" }}>
          {prefsError}
        </div>
      )}

      {/* Only with data: rankRequirementLabels(0) would flash "all 0" during load. */}
      {data && <Legend totalCourses={data.totalCourses} />}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
          <div style={{ textAlign: "center" }}>
            <div className="spinner" style={{ margin: "0 auto 12px" }} />
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading leaderboard…</div>
          </div>
        </div>
      ) : error || !data ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
          Couldn't load the leaderboard.{" "}
          <button
            onClick={loadBoard}
            style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {view === "overall" ? (
            <>
              {visibleStandings.length > 0 && (
                <>
                  <div className="clb-section">Team standings</div>
                  <TeamStandings standings={visibleStandings} activeTeam={filters.team} />
                </>
              )}
              {youRow && (
                <YourRankStrip row={youRow} totalCourses={data.totalCourses} isNarrow={isNarrow} onClick={() => setDetailRepId(user.id)} />
              )}
              {myTeam && <MyTeamSummary summary={myTeam} isNarrow={isNarrow} />}
              <div className="clb-section">Reps</div>
              <RosterGrid
                rows={startedRows}
                notStartedRows={notStartedRows}
                filters={filters}
                isNarrow={isNarrow}
                youId={user.id}
                onOpenRep={setDetailRepId}
              />
            </>
          ) : (
            <CourseView
              courses={data.courses}
              overallById={overallById}
              filters={filters}
              isNarrow={isNarrow}
              youId={user.id}
              hiddenIds={hiddenIds}
              courseId={courseId}
              onCourseId={setCourseId}
              onRows={setCourseRows}
              onOpenRep={setDetailRepId}
            />
          )}
        </>
      )}

      {detailRepId && <RepDetailModal repId={detailRepId} onClose={() => setDetailRepId(null)} />}
      {showOverride && data && (
        <OverrideModal courses={data.courses} onClose={() => setShowOverride(false)} onSaved={loadBoard} />
      )}
      {showHide && (
        <HideModal
          rows={(data?.rows || []).map((r) => ({ id: r.id, name: r.name, email: r.email }))}
          hiddenIds={hiddenIds}
          onClose={() => setShowHide(false)}
          onSave={saveHidden}
        />
      )}

      {/* Replaces the dismissible welcome banner this screen used to show.
          ready gates auto-start until board data lands, so the roster, rank
          strip and legend all exist before any step is measured. */}
      <GuidedTour tour={COURSE_LEADERBOARD_TOUR} ready={!loading} />

      <style jsx>{`
        .clb {
          position: relative;
        }
        .clb-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 6px;
        }
        .clb-title {
          margin: 0;
          font-family: "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif;
          font-size: clamp(22px, 2.6vw, 30px);
          line-height: 1;
          font-weight: 800;
          letter-spacing: 0.01em;
          text-transform: uppercase;
          color: var(--text-primary);
        }
        .clb-sub {
          margin: 8px 0 0;
          font-size: 15px;
          color: var(--text-muted);
        }
        .clb-views {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .clb-view {
          padding: 9px 18px;
          border-radius: 999px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-muted);
          background: transparent;
          border: 1px solid var(--border-default);
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .clb-view:hover { color: var(--text-primary); }
        .clb-view.on {
          background: linear-gradient(90deg, #b30002, #e01418);
          color: #fff;
          border-color: transparent;
          box-shadow: 0 6px 18px rgba(202, 0, 2, 0.3);
        }
        .clb-meta {
          font-size: 12px;
          color: var(--text-muted);
          margin: 10px 0 16px;
        }
        .clb-section {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 20px 0 12px;
        }
      `}</style>
    </div>
  );
}
