import { useState, useEffect, useMemo } from "react";
import { DashboardCard } from "../../components/DashboardCard";
import { AuthenticatedUser, Course, UserProfile } from "../../types";

export function TeamTrainingProgressPage(props: {
  currentUser: AuthenticatedUser;
  teamMembers: UserProfile[];
  courses: Course[];
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  // Which course's lesson list is expanded (for the manager to unlock a lesson).
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  // Memoize publishedCourses to prevent infinite loop
  const publishedCourses = useMemo(() => 
    props.courses.filter((course) => course.status !== "draft"),
    [props.courses]
  );

  const [userProgress, setUserProgress] = useState<Record<string, Record<string, { completed: number; total: number; isCompleted: boolean }>>>({});

  useEffect(() => {
    if (props.teamMembers.length === 0 || publishedCourses.length === 0) return;
    
    const loadAllProgress = async () => {
      const progressData: Record<string, Record<string, { completed: number; total: number; isCompleted: boolean }>> = {};
      
      for (const member of props.teamMembers) {
        progressData[member.id] = {};
        for (const course of publishedCourses) {
          try {
            const res = await fetch(`/api/progress?userId=${member.id}&courseId=${course.id}`);
            const data = await res.json();
            const totalPages = course.pages?.length || 0;
            const completedPages = data.completedPages?.length || 0;
            progressData[member.id][course.id] = {
              completed: completedPages,
              total: totalPages,
              isCompleted: data.courseCompleted || false
            };
          } catch (err) {
            console.error(`Failed to load progress for ${member.id}/${course.id}:`, err);
          }
        }
      }
      
      progressData[props.currentUser.id] = {};
      for (const course of publishedCourses) {
        try {
          const res = await fetch(`/api/progress?userId=${props.currentUser.id}&courseId=${course.id}`);
          const data = await res.json();
          const totalPages = course.pages?.length || 0;
          const completedPages = data.completedPages?.length || 0;
          progressData[props.currentUser.id][course.id] = {
            completed: completedPages,
            total: totalPages,
            isCompleted: data.courseCompleted || false
          };
        } catch (err) {
          console.error(`Failed to load progress for manager:`, err);
        }
      }
      
      setUserProgress(progressData);
    };
    loadAllProgress();
  }, [props.teamMembers, publishedCourses, props.currentUser]);

  const memberProgress = props.teamMembers.map((member) => {
    const coursePercentages = publishedCourses.map((course) => {
      const progress = userProgress[member.id]?.[course.id];
      if (!progress || progress.total === 0) return 0;
      if (progress.isCompleted) return 100;
      return Math.round((progress.completed / progress.total) * 100);
    });
    const overall =
      coursePercentages.length > 0
        ? Math.round(
            coursePercentages.reduce((sum, value) => sum + value, 0) /
              coursePercentages.length
          )
        : 0;
    return {
      member,
      coursePercentages,
      overall
    };
  });

  const completionValues: number[] = [];

  memberProgress.forEach((entry) => {
    completionValues.push(...entry.coursePercentages);
  });

  const teamAverageCompletion =
    completionValues.length > 0
      ? Math.round(
          completionValues.reduce((sum, value) => sum + value, 0) /
            completionValues.length
        )
      : 0;

  const managerCoursePercentages = publishedCourses.map((course) => {
    const progress = userProgress[props.currentUser.id]?.[course.id];
    if (!progress || progress.total === 0) return 0;
    if (progress.isCompleted) return 100;
    return Math.round((progress.completed / progress.total) * 100);
  });

  const managerAverageCompletion =
    managerCoursePercentages.length > 0
      ? Math.round(
          managerCoursePercentages.reduce((sum, value) => sum + value, 0) /
            managerCoursePercentages.length
        )
      : 0;

  const selectedMemberProgress =
    selectedMemberId === null
      ? null
      : memberProgress.find(
          (entry) => entry.member.id === selectedMemberId
        ) ?? null;

  return (
    <div>
      <div className="grid grid-3">
        <DashboardCard
          title="Your Training Completion"
          value={`${managerAverageCompletion}%`}
          description="Across all active trainings"
        />
        <DashboardCard
          title="Team Average Completion"
          value={`${teamAverageCompletion}%`}
          description="Average across your team"
        />
        <DashboardCard
          title="Active Courses"
          value={publishedCourses.length.toString()}
          description="Published trainings"
        />
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Team Training Progress</span>
          </div>
        </div>
        <div className="panel-body">
          {props.teamMembers.length === 0 ? (
            <div className="panel-empty">
              No team members yet. Add sales reps to track training progress.
            </div>
          ) : publishedCourses.length === 0 ? (
            <div className="panel-empty">
              No published trainings yet. Publish courses to track progress.
            </div>
          ) : (
            <div
              style={{
                overflowX: "auto",
                paddingBottom: 4
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 260px) minmax(0, 260px)",
                  columnGap: 12,
                  rowGap: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 8,
                  padding: "4px 0",
                  borderBottom: "1px solid #e5e7eb",
                  color: "#6b7280"
                }}
              >
                <div>Team Member</div>
                <div>Overall Training Progress</div>
              </div>
              {memberProgress.map((entry, rowIndex) => (
                <div
                  key={entry.member.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(0, 260px) minmax(0, 260px)",
                    columnGap: 12,
                    rowGap: 8,
                    alignItems: "center",
                    padding: "8px 0",
                    borderTop:
                      rowIndex === 0
                        ? "1px solid #e5e7eb"
                        : "1px solid #f1f5f9",
                    backgroundColor:
                      rowIndex % 2 === 0 ? "#ffffff" : "#f9fafb"
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {entry.member.name}
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>
                      {entry.member.role.toUpperCase()} •{" "}
                      {entry.member.territory ?? "No territory"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedMemberId(entry.member.id)}
                    style={{
                      border: "none",
                      backgroundColor: "transparent",
                      padding: 0,
                      textAlign: "left",
                      cursor: "pointer"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          minWidth: 32
                        }}
                      >
                        {entry.overall}%
                      </div>
                      <div className="training-card-progress-track">
                        <div
                          className="training-card-progress-fill"
                          style={{ width: `${entry.overall}%` }}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 11,
                        color: "#9ca3af"
                      }}
                    >
                      Click to view per-course breakdown
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {selectedMemberProgress && (
        <div className="overlay">
          <div className="dialog">
            <div className="dialog-title">
              {selectedMemberProgress.member.name}'s Training Progress
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#6b7280",
                marginBottom: 12
              }}
            >
              Overall completion: {selectedMemberProgress.overall}%
            </div>
            <div
              style={{
                maxHeight: 320,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginBottom: 12
              }}
            >
              {publishedCourses.map((course, index) => {
                const pct =
                  selectedMemberProgress.coursePercentages[index] ?? 0;
                const isExpanded = expandedCourseId === course.id;
                return (
                  <div key={course.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCourseId(isExpanded ? null : course.id)
                      }
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        marginBottom: 4,
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: "#111827"
                      }}
                    >
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>
                        {isExpanded ? "▾" : "▸"}
                      </span>
                      {course.title}
                    </button>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          minWidth: 32
                        }}
                      >
                        {pct}%
                      </div>
                      <div className="training-card-progress-track">
                        <div
                          className="training-card-progress-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    {isExpanded && (
                      <MemberCourseLessons
                        memberUserId={selectedMemberProgress.member.id}
                        course={course}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="dialog-footer">
              <div />
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn-secondary btn-cancel"
                  onClick={() => {
                    setSelectedMemberId(null);
                    setExpandedCourseId(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Lesson list for ONE member + course, with a per-lesson unlock/lock toggle.
// A manager can unlock any single lesson/quiz for the member without them
// watching — the unlock is stored separately and never counts toward progress.
function MemberCourseLessons(props: { memberUserId: string; course: Course }) {
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [quizResults, setQuizResults] = useState<any[]>([]);
  const [busyPageId, setBusyPageId] = useState<string | null>(null);

  const pages = useMemo(
    () => (props.course.pages || []).filter((p: any) => p.status === "published"),
    [props.course]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(
      `/api/manager/unlock-lesson?memberUserId=${encodeURIComponent(
        props.memberUserId
      )}&courseId=${encodeURIComponent(props.course.id)}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setCompleted(new Set(data.completedPages || []));
        setUnlocked(new Set(data.unlockedPages || []));
        setQuizResults(data.quizResults || []);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [props.memberUserId, props.course.id]);

  const isCompleted = (p: any) => {
    if (p.isQuiz) {
      const r = quizResults.find((q) => q.pageId === p.id);
      const total = r?.score?.total ?? 0;
      return total > 0 && (r.score.correct ?? 0) / total >= 0.6;
    }
    return completed.has(p.id);
  };

  const toggle = async (pageId: string, unlock: boolean) => {
    setBusyPageId(pageId);
    try {
      const res = await fetch("/api/manager/unlock-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberUserId: props.memberUserId,
          courseId: props.course.id,
          pageId,
          action: unlock ? "unlock" : "lock",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setUnlocked(new Set(data.unlockedPages || []));
      }
    } finally {
      setBusyPageId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: "#9ca3af", padding: "6px 0 6px 16px" }}>
        Loading lessons…
      </div>
    );
  }
  if (pages.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "#9ca3af", padding: "6px 0 6px 16px" }}>
        No published lessons.
      </div>
    );
  }

  return (
    <div style={{ margin: "6px 0 4px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
      {pages.map((p: any) => {
        const done = isCompleted(p);
        const isUnlocked = unlocked.has(p.id);
        return (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "4px 8px",
              borderRadius: 6,
              background: "#f9fafb",
            }}
          >
            <div style={{ fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ color: "#9ca3af", marginRight: 6 }}>{p.isQuiz ? "Quiz" : "Lesson"}</span>
              {p.title}
            </div>
            {done ? (
              <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600, whiteSpace: "nowrap" }}>✓ Completed</span>
            ) : isUnlocked ? (
              <button
                type="button"
                disabled={busyPageId === p.id}
                onClick={() => toggle(p.id, false)}
                style={{ fontSize: 11, fontWeight: 600, color: "#b45309", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {busyPageId === p.id ? "…" : "Unlocked ✕"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busyPageId === p.id}
                onClick={() => toggle(p.id, true)}
                style={{ fontSize: 11, fontWeight: 600, color: "#2563eb", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {busyPageId === p.id ? "…" : "🔓 Unlock"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
