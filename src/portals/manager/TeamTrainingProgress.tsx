import { useState, useEffect, useMemo } from "react";
import { DashboardCard } from "../../components/DashboardCard";
import { AuthenticatedUser, Course, UserProfile } from "../../types";

export function TeamTrainingProgressPage(props: {
  currentUser: AuthenticatedUser;
  teamMembers: UserProfile[];
  courses: Course[];
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  
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
                return (
                  <div key={course.id}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        marginBottom: 4
                      }}
                    >
                      {course.title}
                    </div>
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
                  onClick={() => setSelectedMemberId(null)}
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
