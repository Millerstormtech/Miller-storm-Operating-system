import { useState, useEffect, useRef, ChangeEvent } from "react";
import { DashboardCard } from "../../components/DashboardCard";
import { UserProfile, BusinessPlan } from "../../types";
import { useAuth } from "../../contexts/AuthContext";

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

type LeaderRow = {
  id: string;
  name: string;
  email: string;
  done: number;
  total: number;
  pct: number;
};

type CourseOption = { id: string; title: string };

export function ManagerDashboard(props: { teamMembers: UserProfile[] }) {
  const [committedPlans, setCommittedPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actualData, setActualData] = useState<{[key: string]: number}>({
    dealsActual: 0,
    claimsActual: 0,
    inspectionsActual: 0
  });
  const [editingActuals, setEditingActuals] = useState(false);
  const { user } = useAuth();

  // Leaderboard state
  const [lbCourses, setLbCourses] = useState<CourseOption[]>([]);
  const [lbSelected, setLbSelected] = useState<CourseOption | null>(null);
  const [lbRows, setLbRows] = useState<LeaderRow[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbPickerOpen, setLbPickerOpen] = useState(false);
  const [lbSearch, setLbSearch] = useState("");
  const [show100Club, setShow100Club] = useState(true);
  const lbPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchTeamData() {
      try {
        // Get team members for this manager
        const usersRes = await fetch(`/api/users?role=sales&managerId=${user?.id}`);
        if (usersRes.ok) {
          const teamMembers = await usersRes.json();
          
          // Use businessPlan that's already in User object!
          const committed = teamMembers
            .filter((member: any) => member.businessPlan?.committed)
            .map((member: any) => ({
              userId: member.id,
              userName: member.name,
              businessPlan: member.businessPlan
            }));
          
          setCommittedPlans(committed);
        }

        // Fetch existing actual data for current month/year
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        
        const actualsRes = await fetch(`/api/manager-actuals?managerId=${user?.id}&month=${currentMonth}&year=${currentYear}`);
        if (actualsRes.ok) {
          const actualsData = await actualsRes.json();
          if (actualsData.length > 0) {
            const latest = actualsData[0];
            setActualData({
              dealsActual: latest.dealsActual || 0,
              claimsActual: latest.claimsActual || 0,
              inspectionsActual: latest.inspectionsActual || 0
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch team data:', error);
      } finally {
        setLoading(false);
      }
    }

    if (user?.id) {
      fetchTeamData();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  // Load courses for leaderboard picker
  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.ok ? r.json() : [])
      .then((data: any[]) => {
        const published = data
          .filter((c) => c.status === "published")
          .map((c) => ({ id: c.id, title: c.title }));
        setLbCourses(published);
        if (published.length) loadLbLeaderboard(published[0], data);
      })
      .catch(console.error);
  }, [user?.id]);

  // Close picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (lbPickerRef.current && !lbPickerRef.current.contains(e.target as Node)) {
        setLbPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function loadLbLeaderboard(course: CourseOption, allCoursesData?: any[]) {
    setLbLoading(true);
    setLbSelected(course);
    setLbPickerOpen(false);
    setLbSearch("");
    try {
      // Use new optimized leaderboard API with managerId to filter to only their team
      const leaderboardRes = await fetch(`/api/leaderboard?courseId=${course.id}&managerId=${user?.id}`);
      if (leaderboardRes.ok) {
        const data = await leaderboardRes.json();
        setLbRows(data.rows || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLbLoading(false);
    }
  }

  // Calculate totals from committed plans
  const totals = committedPlans.reduce(
    (acc, plan) => {
      const bp = plan.businessPlan;
      if (!bp) return acc;
      
      const dealsPerYear = bp.dealsPerYear || 0;
      const claimsPerYear = Math.round(dealsPerYear - (dealsPerYear * 0.25));
      const inspectionsPerYear = Math.round(claimsPerYear - (claimsPerYear * 0.30));
      
      acc.dealsPerMonth += dealsPerYear / 12;
      acc.claimsPerMonth += claimsPerYear / 12;
      acc.inspectionsPerMonth += inspectionsPerYear / 12;
      return acc;
    },
    {
      dealsPerMonth: 0,
      claimsPerMonth: 0,
      inspectionsPerMonth: 0
    }
  );

  // Calculate deltas
  const deltas = {
    dealsDelta: actualData.dealsActual - totals.dealsPerMonth,
    claimsDelta: actualData.claimsActual - totals.claimsPerMonth,
    inspectionsDelta: actualData.inspectionsActual - totals.inspectionsPerMonth
  };

  const handleSaveActuals = async () => {
    try {
      // Save the actual data to the database
      const response = await fetch('/api/manager-actuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          managerId: user?.id,
          actualData: actualData,
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear()
        })
      });

      if (response.ok) {
        setEditingActuals(false);
        // Optionally show success message
        console.log('Actuals saved successfully');
      } else {
        console.error('Failed to save actuals');
      }
    } catch (error) {
      console.error('Error saving actuals:', error);
    }
  };

  const handleActualChange = (field: string, value: number) => {
    setActualData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return <div style={{ padding: 24 }}>Loading team data...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Team Goals Section */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#111827", marginBottom: 16 }}>
          Team Goals
        </h2>
        
        <div className="grid grid-3" style={{ gap: 16 }}>
          <DashboardCard
            title="Deals Needed"
            value={Math.round(totals.dealsPerMonth).toLocaleString()}
            description="Monthly target"
          />
          <DashboardCard
            title="Claims Needed"
            value={Math.round(totals.claimsPerMonth).toLocaleString()}
            description="Monthly target"
          />
          <DashboardCard
            title="Inspections Needed"
            value={Math.round(totals.inspectionsPerMonth).toLocaleString()}
            description="Monthly target"
          />
        </div>
      </div>

      {/* Team Actuals Section */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#111827", margin: 0 }}>
            Team Actuals
          </h2>
          <button
            onClick={() => {
              if (editingActuals) {
                handleSaveActuals();
              } else {
                setEditingActuals(true);
              }
            }}
            style={{
              padding: "8px 16px",
              backgroundColor: editingActuals ? "#10b981" : "#3b82f6",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            {editingActuals ? "Save" : "Edit Actuals"}
          </button>
        </div>
        
        <div className="grid grid-3" style={{ gap: 16 }}>
          {editingActuals ? (
            <>
              <div className="dashboard-card">
                <div className="dashboard-card-header">
                  <span className="dashboard-card-title">Deals Actual</span>
                </div>
                <div className="dashboard-card-body">
                  <input
                    type="number"
                    value={actualData.dealsActual}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      handleActualChange('dealsActual', Number(e.target.value))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 16,
                      fontWeight: 600,
                      border: "2px solid #3b82f6",
                      borderRadius: 4,
                      textAlign: "right",
                      backgroundColor: "transparent"
                    }}
                  />
                  <span className="dashboard-card-description">Month to date</span>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="dashboard-card-header">
                  <span className="dashboard-card-title">Claims Actual</span>
                </div>
                <div className="dashboard-card-body">
                  <input
                    type="number"
                    value={actualData.claimsActual}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      handleActualChange('claimsActual', Number(e.target.value))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 16,
                      fontWeight: 600,
                      border: "2px solid #3b82f6",
                      borderRadius: 4,
                      textAlign: "right",
                      backgroundColor: "transparent"
                    }}
                  />
                  <span className="dashboard-card-description">Month to date</span>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="dashboard-card-header">
                  <span className="dashboard-card-title">Inspections Actual</span>
                </div>
                <div className="dashboard-card-body">
                  <input
                    type="number"
                    value={actualData.inspectionsActual}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      handleActualChange('inspectionsActual', Number(e.target.value))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 16,
                      fontWeight: 600,
                      border: "2px solid #3b82f6",
                      borderRadius: 4,
                      textAlign: "right",
                      backgroundColor: "transparent"
                    }}
                  />
                  <span className="dashboard-card-description">Month to date</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <DashboardCard
                title="Deals Actual"
                value={actualData.dealsActual.toLocaleString()}
                description="Month to date"
              />
              <DashboardCard
                title="Claims Actual"
                value={actualData.claimsActual.toLocaleString()}
                description="Month to date"
              />
              <DashboardCard
                title="Inspections Actual"
                value={actualData.inspectionsActual.toLocaleString()}
                description="Month to date"
              />
            </>
          )}
        </div>
      </div>

      {/* Team Delta Section */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#111827", marginBottom: 16 }}>
          Team Delta
        </h2>
        
        <div className="grid grid-3" style={{ gap: 16 }}>
          <DashboardCard
            title="Deals Delta"
            value={`${deltas.dealsDelta >= 0 ? '+' : ''}${Math.round(deltas.dealsDelta).toLocaleString()}`}
            description="Actual vs Goal"
          />
          <DashboardCard
            title="Claims Delta"
            value={`${deltas.claimsDelta >= 0 ? '+' : ''}${Math.round(deltas.claimsDelta).toLocaleString()}`}
            description="Actual vs Goal"
          />
          <DashboardCard
            title="Inspections Delta"
            value={`${deltas.inspectionsDelta >= 0 ? '+' : ''}${Math.round(deltas.inspectionsDelta).toLocaleString()}`}
            description="Actual vs Goal"
          />
        </div>
      </div>

      {/* Team Training Leaderboard */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          background: "#fff", border: "1px solid #e5e7eb",
          borderRadius: 12, overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}>
          {/* Header */}
          <div style={{
            padding: "16px 24px", background: "#f8fafc",
            borderBottom: "1px solid #e5e7eb",
            display: "flex", justifyContent: "space-between",
            alignItems: "center", flexWrap: "wrap", gap: 12,
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>🏆 Team Training Leaderboard</div>
              {lbSelected && (
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{lbSelected.title}</div>
              )}
            </div>

            {/* Course filter */}
            <div style={{ position: "relative" }} ref={lbPickerRef}>
              <button
                onClick={() => setLbPickerOpen((p) => !p)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 16px", borderRadius: 8,
                  border: "1px solid #d1d5db", background: "#fff",
                  fontSize: 13, fontWeight: 600, color: "#374151",
                  cursor: "pointer",
                }}
              >
                🎯 Filter Course <span style={{ color: "#9ca3af" }}>▼</span>
              </button>

              {lbPickerOpen && (
                <div style={{
                  position: "absolute", right: 0, top: "calc(100% + 6px)",
                  width: 300, background: "#fff",
                  border: "1px solid #e5e7eb", borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  zIndex: 100, overflow: "hidden",
                }}>
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                    <input
                      autoFocus
                      value={lbSearch}
                      onChange={(e) => setLbSearch(e.target.value)}
                      placeholder="Search courses..."
                      style={{
                        width: "100%", padding: "7px 10px",
                        border: "1px solid #d1d5db", borderRadius: 6,
                        fontSize: 13, outline: "none", boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div style={{ maxHeight: 240, overflowY: "auto" }}>
                    {lbCourses.filter((c) => c.title.toLowerCase().includes(lbSearch.toLowerCase())).length === 0 ? (
                      <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No courses found</div>
                    ) : (
                      lbCourses
                        .filter((c) => c.title.toLowerCase().includes(lbSearch.toLowerCase()))
                        .map((c) => (
                          <button
                            key={c.id}
                            onClick={() => loadLbLeaderboard(c)}
                            style={{
                              width: "100%", textAlign: "left",
                              padding: "10px 16px", border: "none",
                              background: lbSelected?.id === c.id ? "#eff6ff" : "#fff",
                              color: lbSelected?.id === c.id ? "#2563eb" : "#111827",
                              fontWeight: lbSelected?.id === c.id ? 600 : 400,
                              fontSize: 13, cursor: "pointer",
                              borderBottom: "1px solid #f9fafb",
                            }}
                          >
                            {lbSelected?.id === c.id && "✓ "}{c.title}
                          </button>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 100 Club Section */}
          {(() => {
            const clubMembers = lbRows.filter(r => r.pct === 100);
            if (!lbLoading && clubMembers.length > 0) return (
              <div style={{ borderBottom: "2px solid #d1fae5" }}>
                <button
                  onClick={() => setShow100Club(p => !p)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 24px", border: "none", cursor: "pointer",
                    background: "linear-gradient(90deg, #ecfdf5, #f0fdf4)",
                    borderBottom: show100Club ? "1px solid #d1fae5" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: "linear-gradient(135deg, #059669, #10b981)",
                      color: "#fff", borderRadius: "0 6px 6px 0",
                      padding: "4px 12px 4px 8px", fontSize: 12, fontWeight: 700,
                      letterSpacing: 0.5, position: "relative", marginLeft: 8,
                      boxShadow: "0 2px 6px rgba(16,185,129,0.35)",
                    }}>
                      <div style={{ position: "absolute", left: -8, top: 0, bottom: 0, width: 0, height: 0, borderTop: "13px solid transparent", borderBottom: "13px solid transparent", borderRight: "8px solid #059669" }} />
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      100 Club
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#065f46" }}>{clubMembers.length} member{clubMembers.length !== 1 ? "s" : ""} completed this course</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#059669", fontWeight: 600 }}>{show100Club ? "▲ Hide" : "▼ Show"}</span>
                </button>
                {show100Club && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f0fdf4" }}>
                          {["#", "User", "Lessons", "Progress"].map(h => (
                            <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#065f46", borderBottom: "1px solid #d1fae5", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {clubMembers.map((row, idx) => (
                          <tr key={row.id} style={{ background: idx % 2 === 0 ? "#f0fdf4" : "#ecfdf5" }}>
                            <td style={{ padding: "10px 16px", borderBottom: "1px solid #d1fae5", color: "#059669", fontWeight: 700 }}>{idx + 1}</td>
                            <td style={{ padding: "10px 16px", borderBottom: "1px solid #d1fae5" }}>
                              <div style={{ fontWeight: 600, color: "#111827" }}>{row.name}</div>
                              <div style={{ fontSize: 11, color: "#9ca3af" }}>{row.email}</div>
                            </td>
                            <td style={{ padding: "10px 16px", borderBottom: "1px solid #d1fae5", color: "#065f46", fontWeight: 600 }}>{row.done} / {row.total}</td>
                            <td style={{ padding: "10px 16px", borderBottom: "1px solid #d1fae5", minWidth: 140 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1, height: 8, borderRadius: 999, background: "#d1fae5", overflow: "hidden" }}>
                                  <div style={{ width: "100%", height: "100%", background: "#10b981" }} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#059669", minWidth: 36 }}>100%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
            return null;
          })()}

          {/* Table */}
          {lbLoading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 160 }}>
              <div style={{ textAlign: "center" }}>
                <div className="spinner" style={{ margin: "0 auto 10px" }} />
                <div style={{ color: "#6b7280", fontSize: 13 }}>Loading leaderboard...</div>
              </div>
            </div>
          ) : lbRows.filter(r => r.pct < 100).length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
              No team members found for this course.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["Rank", "User", "Lessons Completed", "Progress"].map((h) => (
                      <th key={h} style={{
                        padding: "11px 16px", textAlign: "left",
                        fontWeight: 600, color: "#374151",
                        borderBottom: "1px solid #e5e7eb",
                        whiteSpace: "nowrap",
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lbRows.filter(r => r.pct < 100).map((row, idx) => {
                    const rank = idx + 1;
                    return (
                      <tr key={row.id} style={{
                        background: rank === 1 ? "#fffbeb" : idx % 2 === 0 ? "#fff" : "#fafafa",
                      }}>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6", width: 60 }}>
                          {MEDAL[rank] ? (
                            <span style={{ fontSize: 18 }}>{MEDAL[rank]}</span>
                          ) : (
                            <span style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 24, height: 24, borderRadius: "50%",
                              background: "#f3f4f6", color: "#6b7280",
                              fontSize: 12, fontWeight: 700,
                            }}>{rank}</span>
                          )}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6" }}>
                          <div style={{ fontWeight: 600, color: "#111827" }}>{row.name}</div>
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>{row.email}</div>
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap", color: "#374151" }}>
                          {row.done} / {row.total}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6", minWidth: 160 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 8, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
                              <div style={{
                                width: `${row.pct}%`, height: "100%",
                                background: row.pct === 100 ? "#10b981" : row.pct > 0 ? "#f59e0b" : "#e5e7eb",
                                transition: "width 0.3s",
                              }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", minWidth: 36 }}>{row.pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}