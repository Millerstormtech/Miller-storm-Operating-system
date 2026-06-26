import { useState, useEffect } from "react";
import { DashboardCard } from "../../components/DashboardCard";
import { SocialMediaCharts } from "../../components/SocialMediaCharts";
import { Course, UserProfile } from "../../types";

type SocialMetric = {
  id: string;
  platform: string;
  platformName: string;
  followers: number;
  posts30d: number;
  views30d: number;
  displayOrder?: number;
  [key: string]: any;
};

type CustomColumn = {
  id: string;
  name: string;
  datatype: "string" | "number" | "boolean" | "date";
};

type DashboardSection = {
  id: string;
  title: string;
  component: JSX.Element;
};

export function AdminDashboard(props: { users: UserProfile[]; courses: Course[]; businessPlans?: any[] }) {
  const [showSocialDetails, setShowSocialDetails] = useState(true);
  const [socialMetrics, setSocialMetrics] = useState<SocialMetric[]>([]);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [courseProgress, setCourseProgress] = useState<any[]>([]);
  const [botStats, setBotStats] = useState<any>({ totalBots: 0, totalSessions: 0, totalMessages: 0 });
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [sections, setSections] = useState<DashboardSection[]>([]);
  const users = props.users;
  const courses = props.courses;
  const businessPlans = props.businessPlans || [];

  useEffect(() => {
    loadSocialMetrics();
    loadCustomColumns();
    loadCourseProgress();
    loadBotStats();
  }, []);

  useEffect(() => {
    initializeSections();
  }, [socialMetrics, customColumns, courseProgress, botStats, businessPlans, users, courses, showSocialDetails]);

  useEffect(() => {
    if (sections.length > 0) {
      const sectionOrder = sections.map(s => s.id);
      localStorage.setItem('dashboardSectionOrder', JSON.stringify(sectionOrder));
    }
  }, [sections]);

  async function loadSocialMetrics() {
    try {
      const res = await fetch("/api/social-media-metrics");
      if (res.ok) {
        const data = await res.json();
        setSocialMetrics(data);
      }
    } catch (error) {
      console.error("Failed to load social metrics:", error);
    }
  }

  async function loadCustomColumns() {
    try {
      const res = await fetch("/api/social-media-metrics/columns");
      if (res.ok) {
        let data = await res.json();
        
        // Apply saved column order from localStorage (same as social metrics page)
        const savedOrder = localStorage.getItem('social-metrics-column-order');
        if (savedOrder) {
          try {
            const orderIds = JSON.parse(savedOrder);
            const orderedColumns = [];
            
            // Add columns in saved order
            for (const id of orderIds) {
              const col = data.find((c: CustomColumn) => c.id === id);
              if (col) orderedColumns.push(col);
            }
            
            // Add any new columns that weren't in saved order
            for (const col of data) {
              if (!orderedColumns.find(c => c.id === col.id)) {
                orderedColumns.push(col);
              }
            }
            
            data = orderedColumns;
          } catch (e) {
            console.error("Failed to apply saved column order:", e);
          }
        }
        
        setCustomColumns(data);
      }
    } catch (error) {
      console.error("Failed to load custom columns:", error);
    }
  }

  async function loadCourseProgress() {
    try {
      // Returns every user's per-course progress in one call:
      // { courses, users, progress: [{ userId, courseId, completedPages,
      //   quizResults, courseCompleted }] }
      const res = await fetch("/api/admin/training-executive-data");
      if (res.ok) {
        const data = await res.json();
        setCourseProgress(data.progress || []);
      }
    } catch (error) {
      console.error("Failed to load course progress:", error);
    }
  }

  async function loadBotStats() {
    try {
      const res = await fetch("/api/bot-stats");
      if (res.ok) {
        const data = await res.json();
        setBotStats(data);
      }
    } catch (error) {
      console.error("Failed to load bot stats:", error);
    }
  }

  const totalSalesReps = users.filter((user) => user.role === "sales").length;
  const totalManagers = users.filter((user) => user.role === "manager").length;

  // Calculate metrics from committed business plans only
  const committedPlans = businessPlans.filter(p => p.businessPlan?.committed);
  
  const calculateMetrics = (incomeGoal: number, dealAve: number) => {
    const dealsPerYear = dealAve > 0 ? Math.round(incomeGoal / dealAve) : 0;
    const dealsPerMonth = dealsPerYear / 12;
    const claimsPerYear = Math.round(dealsPerYear - (dealsPerYear * 0.25));
    const claimsPerMonth = claimsPerYear / 12;
    const inspectionsPerYear = Math.round(claimsPerYear - (claimsPerYear * 0.30));
    const inspectionsPerMonth = inspectionsPerYear / 12;

    return {
      dealsPerYear,
      dealsPerMonth,
      claimsPerYear,
      claimsPerMonth,
      inspectionsPerYear,
      inspectionsPerMonth
    };
  };

  const totals = committedPlans.reduce(
    (acc, plan) => {
      const bp = plan.businessPlan;
      if (!bp) return acc;
      
      const metrics = calculateMetrics(bp.revenueGoal || 0, bp.averageDealSize || 0);
      
      acc.incomeGoal += bp.revenueGoal || 0;
      acc.dealsPerYear += metrics.dealsPerYear;
      acc.dealsPerMonth += metrics.dealsPerMonth;
      acc.claimsPerYear += metrics.claimsPerYear;
      acc.claimsPerMonth += metrics.claimsPerMonth;
      acc.inspectionsPerYear += metrics.inspectionsPerYear;
      acc.inspectionsPerMonth += metrics.inspectionsPerMonth;
      return acc;
    },
    {
      incomeGoal: 0,
      dealsPerYear: 0,
      dealsPerMonth: 0,
      claimsPerYear: 0,
      claimsPerMonth: 0,
      inspectionsPerYear: 0,
      inspectionsPerMonth: 0
    }
  );

  const publishedCourses = courses.filter((course) => course.status !== "draft");

  // Non-admin users are the population for "course completion by module".
  const eligibleUsers = users.filter(u => u.role !== "admin");

  // A quiz counts complete only if a saved result scored >= 60% (app-wide rule).
  function isQuizPassed(result: any) {
    const score = result?.score;
    const total = score?.total || 0;
    return total > 0 && (score.correct || 0) / total >= 0.6;
  }

  // Average completion of a course across all eligible users — lessons watched
  // + quizzes passed, out of all published items. No record counts as 0%.
  function getCourseCompletion(course: any) {
    const pages = (course.pages || []).filter((p: any) => p.status === "published");
    const total = pages.length;
    if (total === 0 || eligibleUsers.length === 0) return 0;
    let sumPct = 0;
    for (const u of eligibleUsers) {
      const rec = courseProgress.find((r: any) => r.courseId === course.id && r.userId === u.id);
      if (!rec) continue;
      const completedSet = new Set(rec.completedPages || []);
      const quizResults = rec.quizResults || [];
      const done = pages.filter((p: any) =>
        p.isQuiz
          ? isQuizPassed(quizResults.find((q: any) => q.pageId === p.id))
          : completedSet.has(p.id)
      ).length;
      sumPct += (done / total) * 100;
    }
    return Math.round(sumPct / eligibleUsers.length);
  }

  const totalCourseCompletionPercentage = publishedCourses.length > 0
    ? Math.round(publishedCourses.reduce((s, c) => s + getCourseCompletion(c), 0) / publishedCourses.length)
    : 0;

  const totalBots = botStats.totalBots || 0;
  const totalChatSessions = botStats.totalSessions || 0;
  const totalBotUpdates = botStats.totalMessages || 0;

  const socialPlatforms = socialMetrics;

  const totalFollowers = socialMetrics.reduce((sum, m) => sum + (m.followers || 0), 0);
  const totalPosts30d = socialMetrics.reduce((sum, m) => sum + (m.posts30d || 0), 0);
  const totalViews30d = socialMetrics.reduce((sum, m) => sum + (m.views30d || 0), 0);

  function initializeSections() {
    const defaultSections: DashboardSection[] = [
      {
        id: "sales-managers",
        title: "Team Members",
        component: (
          <div className="grid grid-4">
            <DashboardCard title="Total Sales Reps" value={totalSalesReps.toString()} />
            <DashboardCard title="Total Managers" value={totalManagers.toString()} />
          </div>
        )
      },
      {
        id: "business-plan",
        title: "Business Plan Roll-up",
        component: (
          <div style={{ display: "flex", gap: 12, width: "100%", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 calc(20% - 10px)", minWidth: 150 }}><DashboardCard title="Total Income Goal" value={`$${totals.incomeGoal.toLocaleString()}`} /></div>
            <div style={{ flex: "1 1 calc(20% - 10px)", minWidth: 150 }}><DashboardCard title="Deals Per Year" value={totals.dealsPerYear.toLocaleString()} /></div>
            <div style={{ flex: "1 1 calc(20% - 10px)", minWidth: 150 }}><DashboardCard title="Deals Per Month" value={totals.dealsPerMonth.toFixed(2)} /></div>
            <div style={{ flex: "1 1 calc(20% - 10px)", minWidth: 150 }}><DashboardCard title="Claims Per Year" value={totals.claimsPerYear.toLocaleString()} /></div>
            <div style={{ flex: "1 1 calc(20% - 10px)", minWidth: 150 }}><DashboardCard title="Claims Per Month" value={totals.claimsPerMonth.toFixed(2)} /></div>
            <div style={{ flex: "1 1 calc(20% - 10px)", minWidth: 150 }}><DashboardCard title="Inspections Per Year" value={totals.inspectionsPerYear.toLocaleString()} /></div>
            <div style={{ flex: "1 1 calc(20% - 10px)", minWidth: 150 }}><DashboardCard title="Inspections Per Month" value={totals.inspectionsPerMonth.toFixed(2)} /></div>
          </div>
        )
      },
      {
        id: "course-completion",
        title: "Course Completion by Module",
        component: (
          publishedCourses.length === 0 ? (
            <div className="panel-empty">No published courses yet.</div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14 }}>
                Overall completion across {eligibleUsers.length} team member{eligibleUsers.length !== 1 ? "s" : ""}:{" "}
                <strong style={{ color: "#111827" }}>{totalCourseCompletionPercentage}%</strong>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {publishedCourses.map(course => {
                  const pct = getCourseCompletion(course);
                  return (
                    <div key={course.id}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14, fontWeight: 600, color: "#374151" }}>
                        <span>{course.title}</span>
                        <span style={{ color: pct >= 100 ? "#16a34a" : "#2563eb" }}>{pct}%</span>
                      </div>
                      <div style={{ height: 10, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "#22c55e" : "#3b82f6", borderRadius: 999, transition: "width .3s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )
      },
      {
        id: "bot-dashboard",
        title: "Bot Dashboard",
        component: (
          <div className="grid grid-3">
            <DashboardCard title="Total Bots" value={totalBots.toString()} description="AI Chat · Lesson Chat · Sales Chat" />
            <DashboardCard title="Total Chat Sessions" value={totalChatSessions.toLocaleString()} />
            <DashboardCard title="Total Messages" value={totalBotUpdates.toLocaleString()} />
            <DashboardCard title="AI Chat Sessions" value={(botStats.aiChatSessions || 0).toLocaleString()} />
            <DashboardCard title="Lesson Chat Sessions" value={(botStats.lessonChatSessions || 0).toLocaleString()} />
            <DashboardCard title="Unique Users Engaged" value={(botStats.uniqueUsers || 0).toLocaleString()} />
          </div>
        )
      },
      {
        id: "social-media",
        title: "Social Media Dashboard",
        component: (
          <>
            {socialPlatforms.length === 0 ? (
              <div className="panel-empty">
                No social media metrics configured yet.{" "}
                <a href="/admin/social-media-metrics" style={{ color: "#2563eb", textDecoration: "underline" }}>
                  Add metrics
                </a>
              </div>
            ) : (
              <>
                <div className="grid grid-3" style={{ marginBottom: 16 }}>
                  {customColumns.map(col => {
                    if (col.datatype === "number") {
                      const total = socialMetrics.reduce((sum, m) => {
                        const value = m[col.name];
                        return sum + (typeof value === 'number' ? value : 0);
                      }, 0);
                      return (
                        <DashboardCard key={col.id} title={`Total ${col.name}`} value={total.toLocaleString()} />
                      );
                    }
                    return null;
                  })}
                </div>

                {showSocialDetails && (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `1fr ${customColumns.map(() => "1fr").join(" ")}`,
                        gap: 12,
                        fontSize: 12,
                        fontWeight: 600,
                        marginBottom: 8,
                        padding: "12px 16px",
                        borderBottom: "2px solid #e5e7eb",
                        color: "#374151",
                        backgroundColor: "#f9fafb"
                      }}
                    >
                      <div>Platform</div>
                      {customColumns.map(col => (
                        <div key={col.id} style={{ textAlign: "center" }}>{col.name}</div>
                      ))}
                    </div>

                    {socialMetrics.map((metric, index) => (
                      <div
                        key={metric.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: `1fr ${customColumns.map(() => "1fr").join(" ")}`,
                          gap: 12,
                          alignItems: "center",
                          padding: "12px 16px",
                          borderBottom: "1px solid #f1f5f9",
                          backgroundColor: index % 2 === 0 ? "#ffffff" : "#f9fafb",
                          fontSize: 14
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>{metric.platformName}</div>
                        {customColumns.map(col => (
                          <div key={col.id} style={{ textAlign: "center", fontWeight: 500 }}>
                            {col.datatype === "number" ? (metric[col.name] || 0).toLocaleString() : metric[col.name] || "-"}
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                )}
                
                <div style={{ marginTop: 24 }}>
                  <SocialMediaCharts platforms={socialMetrics} customColumns={customColumns} />
                </div>
              </>
            )}
          </>
        )
      }
    ];

    try {
      const savedOrder = localStorage.getItem('dashboardSectionOrder');
      if (savedOrder) {
        const orderIds = JSON.parse(savedOrder);
        const orderedSections = orderIds
          .map((id: string) => defaultSections.find(s => s.id === id))
          .filter(Boolean);
        
        const existingIds = orderIds;
        const newSections = defaultSections.filter(s => !existingIds.includes(s.id));
        
        setSections([...orderedSections, ...newSections]);
        return;
      }
    } catch (error) {
      console.error('Failed to restore section order:', error);
    }

    setSections(defaultSections);
  }

  function handleDragStart(e: React.DragEvent, sectionId: string) {
    setDraggedItem(sectionId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetId) return;

    const draggedIndex = sections.findIndex(s => s.id === draggedItem);
    const targetIndex = sections.findIndex(s => s.id === targetId);

    const newSections = [...sections];
    const [removed] = newSections.splice(draggedIndex, 1);
    newSections.splice(targetIndex, 0, removed);

    setSections(newSections);
    setDraggedItem(null);
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard-head">
        <h1>Dashboard</h1>
        <p>Live overview of your team, training, bots and social reach.</p>
      </div>
      {sections.map((section) => (
        <div
          key={section.id}
          className="panel"
          style={{ 
            marginBottom: 16,
            opacity: draggedItem === section.id ? 0.5 : 1,
            transition: "opacity 0.2s ease"
          }}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, section.id)}
        >
          <div className="panel-header">
            <div className="panel-header-row">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: "2px solid #6b7280",
                    backgroundColor: "#f9fafb",
                    cursor: "move",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    color: "#6b7280",
                    transition: "all 0.2s ease"
                  }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, section.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#e5e7eb";
                    e.currentTarget.style.borderColor = "#374151";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#f9fafb";
                    e.currentTarget.style.borderColor = "#6b7280";
                  }}
                >
                  ⋮⋮
                </button>
                <span>{section.title}</span>
              </div>
              {section.id === "social-media" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => window.location.href = "/admin/social-media-metrics"}
                  >
                    Manage Metrics
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => setShowSocialDetails(!showSocialDetails)}
                  >
                    {showSocialDetails ? "Hide Details" : "Show Details"}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="panel-body">
            {section.component}
          </div>
        </div>
      ))}
    </div>
  );
}
