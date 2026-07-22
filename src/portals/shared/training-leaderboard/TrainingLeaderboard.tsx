import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { isRankedRole } from "../../../lib/training/scoring";
import type { BoardFilters, OverallResponse, OverallRow } from "../../../lib/training/board";
import { teamSummaryFor } from "../../../lib/training/board";
import { resolveTeam, TEAM_BRANCH, resolveNameBranch } from "../../../lib/repcard/org-chart";
import { useIsNarrow } from "./useIsNarrow";
import { WelcomeBanner } from "./WelcomeBanner";
import { Legend } from "./Legend";
import { FiltersBar } from "./FiltersBar";
import { RosterGrid } from "./RosterGrid";
import { CourseView } from "./CourseView";
import { YourRankStrip } from "./YourRankStrip";
import { MyTeamSummary } from "./MyTeamSummary";
import { AdminMenu } from "./AdminMenu";
import { OverrideModal } from "./OverrideModal";
import { HideModal } from "./HideModal";

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
  const [prefsError, setPrefsError] = useState<string | null>(null);

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

  if (!user) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: isNarrow ? 16 : 19, fontWeight: 800, color: "#111827" }}>🏆 Course Leaderboard</div>
        {data && (
          <div style={{ fontSize: isNarrow ? 11 : 12, color: "#6b7280" }}>
            Ranked across all {data.totalCourses} courses · {data.totalItems} lessons &amp; quizzes
          </div>
        )}
      </div>

      <WelcomeBanner userId={user.id} />

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
            <div style={{ color: "#6b7280", fontSize: 13 }}>Loading leaderboard…</div>
          </div>
        </div>
      ) : error || !data ? (
        <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
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
          {view === "overall" && youRow && (
            <YourRankStrip row={youRow} totalCourses={data.totalCourses} isNarrow={isNarrow} />
          )}
          {view === "overall" && myTeam && <MyTeamSummary summary={myTeam} isNarrow={isNarrow} />}

          {view === "overall" ? (
            <RosterGrid
              rows={startedRows}
              notStartedRows={notStartedRows}
              filters={filters}
              isNarrow={isNarrow}
              youId={user.id}
            />
          ) : (
            <CourseView
              courses={data.courses}
              overallById={overallById}
              filters={filters}
              isNarrow={isNarrow}
              youId={user.id}
              hiddenIds={hiddenIds}
            />
          )}
        </>
      )}

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
    </div>
  );
}
