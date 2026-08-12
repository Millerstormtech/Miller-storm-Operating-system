import { useEffect, useState } from "react";
import { isQuizResultPassing } from "../../lib/quiz";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  done: number;
  total: number;
  pct: number;
  status: "Completed" | "In Progress" | "Not Started";
};

type CourseStats = {
  course: any;
  totalUsers: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  avgCompletion: number;
  managers: UserRow[];
  sales: UserRow[];
};

export function TrainingExecutiveView() {
  const [stats, setStats] = useState<CourseStats[]>([]);
  const [totalEnrolled, setTotalEnrolled] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  // expanded[courseId] = true/false
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // activeTab[courseId] = "manager" | "sales"
  const [activeTab, setActiveTab] = useState<Record<string, "manager" | "sales">>({});
  // Admin controls
  const [showAdminControls, setShowAdminControls] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [hiddenUsers, setHiddenUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/training-executive-data");
        const { courses, users, progress: allProgressRecords } = response.ok ? await response.json() : { courses: [], users: [], progress: [] };

        const targetUsers = users.filter(
          (u: any) =>
            !u.deleted &&
            !u.suspended &&
            (u.role === "sales-team-lead" || u.role === "sales" ||
              (u.roles || []).some((r: string) => r === "sales-team-lead" || r === "sales"))
        );

        const published = courses.filter((c: any) => c.status === "published");
        if (!published.length || !targetUsers.length) {
          setStats([]);
          setIsLoading(false);
          return;
        }

        // Create a map: userId -> courseId -> progress
        const progressMap: Record<string, Record<string, any>> = {};
        allProgressRecords.forEach((record: any) => {
          if (!progressMap[record.userId]) {
            progressMap[record.userId] = {};
          }
          progressMap[record.userId][record.courseId] = {
            completedPages: record.completedPages || [],
            quizResults: record.quizResults || [],
            courseCompleted: record.courseCompleted || false
          };
        });

        const result: CourseStats[] = published.map((course: any) => {
          // Count ALL published items (lessons + quizzes), matching the app.
          const publishedPages = (course.pages || []).filter(
            (p: any) => p.status === "published"
          );
          const total = publishedPages.length;
          if (total === 0) return null;

          let completed = 0, inProgress = 0, notStarted = 0, totalPct = 0;
          const managers: UserRow[] = [];
          const sales: UserRow[] = [];

          targetUsers.forEach((u: any) => {
            const rec = progressMap[u.id]?.[course.id] || {};
            const completedSet = new Set(rec.completedPages || []);
            const quizResults = rec.quizResults || [];
            const done = publishedPages.filter((p: any) =>
              p.isQuiz
                ? isQuizResultPassing(quizResults.find((r: any) => r.pageId === p.id))
                : completedSet.has(p.id)
            ).length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            totalPct += pct;

            let status: UserRow["status"];
            if (total > 0 && done === total) { status = "Completed"; completed++; }
            else if (done > 0) { status = "In Progress"; inProgress++; }
            else { status = "Not Started"; notStarted++; }

            const row: UserRow = {
              id: u.id,
              name: u.name || u.email,
              email: u.email,
              role: u.role || (u.roles || [])[0] || "",
              done,
              total,
              pct,
              status,
            };

            const isManager = u.role === "sales-team-lead" || (u.roles || []).includes("sales-team-lead");
            if (isManager) managers.push(row);
            else sales.push(row);
          });

          return {
            course,
            totalUsers: targetUsers.length,
            completed,
            inProgress,
            notStarted,
            avgCompletion: targetUsers.length > 0 ? Math.round(totalPct / targetUsers.length) : 0,
            managers,
            sales,
          };
        }).filter(Boolean) as CourseStats[];

        // Count unique users who have started at least one course
        const enrolledIds = new Set<string>();
        result.forEach(({ managers, sales }) => {
          [...managers, ...sales].forEach((row) => {
            if (row.done > 0 || row.status === "Completed") enrolledIds.add(row.id);
          });
        });
        setTotalEnrolled(enrolledIds.size);
        setStats(result);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  function toggleExpand(courseId: string) {
    setExpanded((prev) => ({ ...prev, [courseId]: !prev[courseId] }));
    setActiveTab((prev) => ({ ...prev, [courseId]: prev[courseId] || "manager" }));
  }

  function toggleUserSelection(userId: string) {
    setSelectedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) newSet.delete(userId);
      else newSet.add(userId);
      return newSet;
    });
  }

  function saveSelectedUsers() {
    setHiddenUsers(prev => new Set([...prev, ...selectedUsers]));
    setSelectedUsers(new Set());
    setShowAdminControls(false);
  }

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
        <div style={{ textAlign: "center" }}>
          <div className="spinner" style={{ margin: "0 auto 16px" }} />
          <div style={{ color: "var(--text-muted)" }}>Loading training data...</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {stats.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-subtle)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
          No published courses or users found.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Admin Controls */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setShowAdminControls(!showAdminControls)}
              style={{
                opacity: 0, width: 1, height: 1, border: "none",
                background: "none", cursor: "pointer", position: "absolute"
              }}
            />
            {showAdminControls && (
              <>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Select users to hide:</span>
                <button
                  onClick={saveSelectedUsers}
                  disabled={selectedUsers.size === 0}
                  style={{
                    padding: "4px 12px", fontSize: 12, borderRadius: 4,
                    border: "1px solid #d1d5db", background: "var(--surface-default)",
                    color: selectedUsers.size > 0 ? "#2563eb" : "var(--text-subtle)",
                    cursor: selectedUsers.size > 0 ? "pointer" : "not-allowed"
                  }}
                >
                  Save ({selectedUsers.size})
                </button>
                <button
                  onClick={() => { setSelectedUsers(new Set()); setShowAdminControls(false); }}
                  style={{
                    padding: "4px 12px", fontSize: 12, borderRadius: 4,
                    border: "1px solid #d1d5db", background: "var(--surface-default)",
                    color: "var(--text-muted)", cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
          {/* Summary stat bar */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 1, background: "var(--surface-muted)",
            border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)", marginBottom: 4,
          }}>
            {[
              { label: "Total Users Enrolled", value: totalEnrolled, color: "#2563eb", icon: "👥" },
              { label: "Total Courses", value: stats.length, color: "#7c3aed", icon: "📚" },
              { label: "Overall Avg Completion", value: `${stats.length > 0 ? Math.round(stats.reduce((s, c) => s + c.avgCompletion, 0) / stats.length) : 0}%`, color: "#10b981", icon: "📈" },
            ].map((s) => (
              <div key={s.label} style={{ background: "var(--surface-default)", padding: "20px 24px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 28 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
          {stats.map(({ course, totalUsers, completed, inProgress, notStarted, avgCompletion, managers, sales }) => {
            const isOpen = !!expanded[course.id];
            const tab = activeTab[course.id] || "manager";
            const rows = tab === "manager" ? managers : sales;

            return (
              <div key={course.id} style={{
                background: "var(--surface-default)", border: "1px solid var(--border-default)",
                borderRadius: 12, overflow: "hidden",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
              }}>
                {/* Course header */}
                <div style={{
                  padding: "16px 24px", background: "#f8fafc",
                  borderBottom: "1px solid var(--border-default)",
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", flexWrap: "wrap", gap: 8
                }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>{course.title}</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{totalUsers} user{totalUsers !== 1 ? "s" : ""} tracked</div>
                </div>

                {/* Stats grid */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 1, background: "var(--surface-muted)"
                }}>
                  {[
                    { label: "Users Completed", value: completed, color: "#10b981" },
                    { label: "Users In Progress", value: inProgress, color: "#f59e0b" },
                    { label: "Users Not Started", value: notStarted, color: "#ef4444" },
                    { label: "Avg Completion", value: `${avgCompletion}%`, color: "#2563eb" },
                  ].map((stat) => (
                    <div key={stat.label} style={{ background: "var(--surface-default)", padding: "18px 20px" }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div style={{ padding: "14px 24px", borderTop: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "var(--surface-muted)" }}>
                    {totalUsers > 0 && (
                      <>
                        <div style={{ width: `${(completed / totalUsers) * 100}%`, background: "#10b981", transition: "width 0.4s" }} />
                        <div style={{ width: `${(inProgress / totalUsers) * 100}%`, background: "#f59e0b", transition: "width 0.4s" }} />
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
                    <span><span style={{ color: "#10b981" }}>■</span> Completed</span>
                    <span><span style={{ color: "#f59e0b" }}>■</span> In Progress</span>
                    <span><span style={{ color: "var(--text-subtle)" }}>■</span> Not Started</span>
                  </div>
                </div>

                {/* Toggle button */}
                <div style={{ padding: "0 24px 14px" }}>
                  <button
                    onClick={() => toggleExpand(course.id)}
                    style={{
                      background: "none", border: "1px solid #d1d5db",
                      borderRadius: 6, padding: "6px 14px",
                      fontSize: 13, color: "var(--text-tertiary)", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <span>{isOpen ? "▲" : "▼"}</span>
                    {isOpen ? "Hide" : "Show"} User Breakdown
                    <span style={{
                      background: "var(--surface-subtle)", borderRadius: 999,
                      padding: "1px 8px", fontSize: 12, color: "var(--text-muted)"
                    }}>
                      {managers.length + sales.length}
                    </span>
                  </button>
                </div>

                {/* Expandable user table */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--border-default)" }}>
                    {/* Tabs */}
                    <div style={{ display: "flex", borderBottom: "1px solid var(--border-default)", background: "#f9fafb" }}>
                      {(["manager", "sales"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setActiveTab((prev) => ({ ...prev, [course.id]: t }))}
                          style={{
                            padding: "10px 20px", border: "none", cursor: "pointer",
                            fontSize: 13, fontWeight: tab === t ? 700 : 400,
                            color: tab === t ? "#2563eb" : "var(--text-muted)",
                            background: "none",
                            borderBottom: tab === t ? "2px solid #2563eb" : "2px solid transparent",
                            textTransform: "capitalize",
                          }}
                        >
                          {t === "manager" ? "Sales Team Leads" : "Sales"}{" "}
                          <span style={{
                            background: tab === t ? "#eff6ff" : "var(--surface-subtle)",
                            color: tab === t ? "#2563eb" : "var(--text-subtle)",
                            borderRadius: 999, padding: "1px 7px", fontSize: 11
                          }}>
                            {t === "manager" ? managers.length : sales.length}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Table */}
                    {rows.length === 0 ? (
                      <div style={{ padding: "24px", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
                        No {tab} users found.
                      </div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: "#f9fafb" }}>
                              {["User", "Progress", "Lessons Completed", "Status"].map((h) => (
                                <th key={h} style={{
                                  padding: "10px 16px", textAlign: "left",
                                  fontWeight: 600, color: "var(--text-tertiary)",
                                  borderBottom: "1px solid var(--border-default)",
                                  whiteSpace: "nowrap",
                                }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.filter(row => !hiddenUsers.has(row.id)).map((row, idx) => (
                              <tr key={row.id} style={{ background: idx % 2 === 0 ? "var(--surface-default)" : "#fafafa" }}>
                                {/* User */}
                                <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    {showAdminControls && (
                                      <input
                                        type="checkbox"
                                        checked={selectedUsers.has(row.id)}
                                        onChange={() => toggleUserSelection(row.id)}
                                        style={{ cursor: "pointer" }}
                                      />
                                    )}
                                    <div>
                                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{row.name}</div>
                                      <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>{row.email}</div>
                                    </div>
                                  </div>
                                </td>
                                {/* Progress bar */}
                                <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", minWidth: 140 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div style={{ flex: 1, height: 7, borderRadius: 999, background: "var(--surface-muted)", overflow: "hidden" }}>
                                      <div style={{
                                        width: `${row.pct}%`,
                                        height: "100%",
                                        background: row.pct === 100 ? "#10b981" : row.pct > 0 ? "#f59e0b" : "var(--surface-muted)",
                                        transition: "width 0.3s",
                                      }} />
                                    </div>
                                    <span style={{ fontSize: 12, color: "var(--text-tertiary)", minWidth: 32 }}>{row.pct}%</span>
                                  </div>
                                </td>
                                {/* Lessons */}
                                <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap", color: "var(--text-tertiary)" }}>
                                  {row.done} / {row.total}
                                </td>
                                {/* Status badge */}
                                <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                                  <span style={{
                                    padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                                    background: row.status === "Completed" ? "#d1fae5" : row.status === "In Progress" ? "#fef3c7" : "var(--surface-subtle)",
                                    color: row.status === "Completed" ? "#065f46" : row.status === "In Progress" ? "#92400e" : "var(--text-muted)",
                                  }}>
                                    {row.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
