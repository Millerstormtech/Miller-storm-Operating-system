import { useState, useEffect, useRef } from "react";
import { DashboardCard } from "../../components/DashboardCard";
import { UserProfile } from "../../types";
import { QuickStartChecklist } from "../../components/QuickStartChecklist";

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

type LeaderRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  done: number;
  total: number;
  pct: number;
};

type CourseOption = { id: string; title: string };

export function SalesDashboard(props: { profile: UserProfile }) {
  const plan = props.profile.businessPlan;
  const incomeGoal = plan?.revenueGoal ?? 0;
  const dealsNeeded = plan?.dealsPerYear ?? 0;
  const claimsNeeded = Math.round(dealsNeeded - (dealsNeeded * 0.25)); // 75% of deals
  const inspectionsNeeded = Math.round(claimsNeeded - (claimsNeeded * 0.30)); // 70% of claims
  
  const location = props.profile.territory ?? "";

  const [isEditing, setIsEditing] = useState(false);
  const [incomeActual, setIncomeActual] = useState(0);
  const [dealsActual, setDealsActual] = useState(0);
  const [claimsActual, setClaimsActual] = useState(0);
  const [inspectionsActual, setInspectionsActual] = useState(0);

  // Leaderboard state
  const [lbCourses, setLbCourses] = useState<CourseOption[]>([]);
  const [lbSelected, setLbSelected] = useState<CourseOption | null>(null);
  const [lbRows, setLbRows] = useState<LeaderRow[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbPickerOpen, setLbPickerOpen] = useState(false);
  const [lbSearch, setLbSearch] = useState("");
  const [show100Club, setShow100Club] = useState(true);
  const lbPickerRef = useRef<HTMLDivElement>(null);

  // Load actuals from database
  useEffect(() => {
    async function loadActuals() {
      try {
        const response = await fetch(`/api/business-plan?userId=${props.profile.id}`);
        if (response.ok) {
          const data = await response.json();
          const userPlan = data.find((plan: any) => plan.userId === props.profile.id);
          if (userPlan?.actuals) {
            setIncomeActual(userPlan.actuals.incomeActual || 0);
            setDealsActual(userPlan.actuals.dealsActual || 0);
            setClaimsActual(userPlan.actuals.claimsActual || 0);
            setInspectionsActual(userPlan.actuals.inspectionsActual || 0);
          }
        }
      } catch (error) {
        console.error('Failed to load actuals:', error);
      }
    }
    
    loadActuals();
  }, [props.profile.id]);

  // Load courses for leaderboard
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
  }, [props.profile.id]);

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
      // Use new optimized leaderboard API
      const leaderboardRes = await fetch(`/api/leaderboard?courseId=${course.id}`);
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

  async function handleSave() {
    try {
      // Save actuals to database
      await fetch('/api/business-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: props.profile.id,
          actuals: {
            incomeActual,
            dealsActual,
            claimsActual,
            inspectionsActual
          }
        })
      });
      
      setIsEditing(false);
      alert('Actuals saved successfully!');
    } catch (error) {
      console.error('Failed to save actuals:', error);
      alert('Failed to save actuals');
    }
  }

  const incomeDelta = incomeActual - incomeGoal;
  const dealsDelta = dealsActual - dealsNeeded;
  const claimsDelta = claimsActual - claimsNeeded;
  const inspectionsDelta = inspectionsActual - inspectionsNeeded;

  const comparisonItems = [
    {
      id: "income",
      label: "Income",
      goal: incomeGoal,
      actual: incomeActual,
      format: (value: number) => `$${value.toLocaleString()}`
    },
    {
      id: "deals",
      label: "Deals",
      goal: dealsNeeded,
      actual: dealsActual,
      format: (value: number) => value.toLocaleString()
    },
    {
      id: "claims",
      label: "Claims",
      goal: claimsNeeded,
      actual: claimsActual,
      format: (value: number) => value.toLocaleString()
    },
    {
      id: "inspections",
      label: "Inspections",
      goal: inspectionsNeeded,
      actual: inspectionsActual,
      format: (value: number) => value.toLocaleString()
    }
  ];

  const maxComparisonValue = Math.max(
    incomeGoal, incomeActual,
    dealsNeeded, dealsActual,
    claimsNeeded, claimsActual,
    inspectionsNeeded, inspectionsActual
  );

  return (
    <div className="sales-dashboard">
      <div className="sales-plan-summary">
        <div className="sales-plan-summary-main">
          <div className="sales-plan-summary-name">{props.profile.name}</div>
          {location && (
            <div className="sales-plan-summary-location">{location}</div>
          )}
        </div>
      </div>
      <QuickStartChecklist profile={props.profile} />
      <div className="sales-plan-heading">
        <div className="sales-plan-summary-main">
          <div className="sales-plan-summary-name">Goals Committed to</div>
        </div>
      </div>
      <div className="grid grid-4">
        <DashboardCard
          title="Income Goal"
          value={`$${incomeGoal.toLocaleString()}`}
          description="Per year"
        />
        <DashboardCard
          title="Deals Needed"
          value={dealsNeeded.toLocaleString()}
          description="Per year"
        />
        <DashboardCard
          title="Claims Needed"
          value={claimsNeeded.toLocaleString()}
          description="Per year"
        />
        <DashboardCard
          title="Inspections Needed"
          value={inspectionsNeeded.toLocaleString()}
          description="Per year"
        />
      </div>
      <div className="sales-plan-heading">
        <div className="sales-plan-summary-main">
          <div className="sales-plan-summary-name">Actuals</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isEditing ? (
            <button type="button" className="btn-primary btn-small" onClick={() => setIsEditing(true)}>
              Edit
            </button>
          ) : (
            <>
              <button type="button" className="btn-primary btn-success btn-small" onClick={handleSave}>
                Save
              </button>
              <button type="button" className="btn-secondary btn-small" onClick={() => setIsEditing(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
      <div className="grid grid-4">
        {isEditing ? (
          <>
            <div className="card">
              <div className="card-title">Income Actual</div>
              <input 
                type="number" 
                className="field-input" 
                value={incomeActual} 
                onChange={(e) => setIncomeActual(Number(e.target.value))}
                style={{ marginTop: 8, width: '100%', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Per year</div>
            </div>
            <div className="card">
              <div className="card-title">Deals Actual</div>
              <input 
                type="number" 
                className="field-input" 
                value={dealsActual} 
                onChange={(e) => setDealsActual(Number(e.target.value))}
                style={{ marginTop: 8, width: '100%', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Per year</div>
            </div>
            <div className="card">
              <div className="card-title">Claims Actual</div>
              <input 
                type="number" 
                className="field-input" 
                value={claimsActual} 
                onChange={(e) => setClaimsActual(Number(e.target.value))}
                style={{ marginTop: 8, width: '100%', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Per year</div>
            </div>
            <div className="card">
              <div className="card-title">Inspections Actual</div>
              <input 
                type="number" 
                className="field-input" 
                value={inspectionsActual} 
                onChange={(e) => setInspectionsActual(Number(e.target.value))}
                style={{ marginTop: 8, width: '100%', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Per year</div>
            </div>
          </>
        ) : (
          <>
            <DashboardCard
              title="Income Actual"
              value={`$${incomeActual.toLocaleString()}`}
              description="Per year"
            />
            <DashboardCard 
              title="Deals Actual" 
              value={String(dealsActual)}
              description="Per year"
            />
            <DashboardCard
              title="Claims Actual"
              value={claimsActual.toLocaleString()}
              description="Per year"
            />
            <DashboardCard
              title="Inspections Actual"
              value={inspectionsActual.toLocaleString()}
              description="Per year"
            />
          </>
        )}
      </div>
      <div className="sales-plan-heading">
        <div className="sales-plan-summary-main">
          <div className="sales-plan-summary-name">Delta</div>
        </div>
      </div>
      <div className="grid grid-4">
        <DashboardCard
          title="Income Delta"
          value={`$${incomeDelta.toLocaleString()}`}
          description="Per year"
        />
        <DashboardCard
          title="Deals Delta"
          value={dealsDelta.toLocaleString()}
          description="Per year"
        />
        <DashboardCard
          title="Claims Delta"
          value={claimsDelta.toLocaleString()}
          description="Per year"
        />
        <DashboardCard
          title="Inspections Delta"
          value={inspectionsDelta.toLocaleString()}
          description="Per year"
        />
      </div>
      <div className="sales-chart-card">
        <div className="sales-chart-header">Monthly Reports & Analysis</div>
        <div className="sales-chart-body">
          {comparisonItems.map((item) => {
            const progressPercentage = item.goal > 0 ? Math.min((item.actual / item.goal) * 100, 100) : 0;

            return (
              <div key={item.id} className="sales-chart-row">
                <div className="sales-chart-label">{item.label}</div>
                <div className="sales-chart-bar-area">
                  <div className="sales-chart-side sales-chart-side-commit">
                    <div className="sales-chart-side-label">Commit</div>
                    <div className="sales-chart-side-value">
                      {item.format(item.goal)}
                    </div>
                  </div>
                  <div className="sales-chart-bar-bg">
                    <div
                      className="sales-chart-bar-fill"
                      style={{ width: `${progressPercentage}%` }}
                    />
                    <div
                      className="sales-chart-runner"
                      style={{ left: `${progressPercentage}%` }}
                    />
                  </div>
                  <div className="sales-chart-side sales-chart-side-actual">
                    <div className="sales-chart-side-label">Actual</div>
                    <div className="sales-chart-side-value">
                      {item.format(item.actual)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Training Leaderboard */}
      {(() => {
        const myRank = lbRows.findIndex((r) => r.id === props.profile.id);
        const myRow = myRank >= 0 ? lbRows[myRank] : null;
        const filteredCourses = lbCourses.filter((c) =>
          c.title.toLowerCase().includes(lbSearch.toLowerCase())
        );

        return (
          <div style={{ marginTop: 24 }}>
            <div style={{
              background: "#fff", border: "1px solid #e5e7eb",
              borderRadius: 12, overflow: "hidden",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}>
              {/* Header with current user rank */}
              <div style={{
                padding: "16px 24px", background: "#f8fafc",
                borderBottom: "1px solid #e5e7eb",
                display: "flex", justifyContent: "space-between",
                alignItems: "center", flexWrap: "wrap", gap: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>🏆 Training Leaderboard</div>
                    {lbSelected && (
                      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{lbSelected.title}</div>
                    )}
                  </div>
                  {/* Current user rank badge */}
                  {myRow && !lbLoading && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "#eff6ff", border: "1px solid #bfdbfe",
                      borderRadius: 10, padding: "8px 16px",
                    }}>
                      <span style={{ fontSize: 22 }}>
                        {MEDAL[myRank + 1] || `#${myRank + 1}`}
                      </span>
                      <div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>Your Rank</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#1d4ed8" }}>
                          {myRank + 1} of {lbRows.length}
                        </div>
                      </div>
                      <div style={{ width: 1, height: 32, background: "#bfdbfe" }} />
                      <div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>Your Progress</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#1d4ed8" }}>
                          {myRow.pct}% &nbsp;
                          <span style={{ fontWeight: 400, fontSize: 12, color: "#6b7280" }}>
                            ({myRow.done}/{myRow.total} lessons)
                          </span>
                        </div>
                      </div>
                    </div>
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
                        {filteredCourses.length === 0 ? (
                          <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No courses found</div>
                        ) : (
                          filteredCourses.map((c) => (
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
                              {["#", "User", "Role", "Lessons", "Progress"].map(h => (
                                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#065f46", borderBottom: "1px solid #d1fae5", whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {clubMembers.map((row, idx) => (
                              <tr key={row.id} style={{ background: idx % 2 === 0 ? "#f0fdf4" : "#ecfdf5" }}>
                                <td style={{ padding: "10px 16px", borderBottom: "1px solid #d1fae5", color: "#059669", fontWeight: 700 }}>{idx + 1}</td>
                                <td style={{ padding: "10px 16px", borderBottom: "1px solid #d1fae5" }}>
                                  <div style={{ fontWeight: 600, color: "#111827", display: "flex", alignItems: "center", gap: 6 }}>
                                    {row.name}
                                    {row.id === props.profile.id && <span style={{ fontSize: 10, fontWeight: 700, background: "#3b82f6", color: "#fff", borderRadius: 999, padding: "1px 6px" }}>YOU</span>}
                                  </div>
                                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{row.email}</div>
                                </td>
                                <td style={{ padding: "10px 16px", borderBottom: "1px solid #d1fae5" }}>
                                  <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: row.role === "manager" ? "#ede9fe" : "#dbeafe", color: row.role === "manager" ? "#6d28d9" : "#1d4ed8", textTransform: "capitalize" }}>{row.role}</span>
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
                  No data available.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        {["Rank", "User", "Role", "Lessons Completed", "Progress"].map((h) => (
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
                        const isMe = row.id === props.profile.id;
                        return (
                          <tr key={row.id} style={{
                            background: isMe
                              ? "#dbeafe"
                              : rank === 1 ? "#fffbeb"
                              : idx % 2 === 0 ? "#fff" : "#fafafa",
                            outline: isMe ? "2px solid #3b82f6" : "none",
                          }}>
                            <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6", width: 60 }}>
                              {MEDAL[rank] ? (
                                <span style={{ fontSize: 18 }}>{MEDAL[rank]}</span>
                              ) : (
                                <span style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  width: 24, height: 24, borderRadius: "50%",
                                  background: isMe ? "#3b82f6" : "#f3f4f6",
                                  color: isMe ? "#fff" : "#6b7280",
                                  fontSize: 12, fontWeight: 700,
                                }}>{rank}</span>
                              )}
                            </td>
                            <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6" }}>
                              <div style={{ fontWeight: 600, color: "#111827", display: "flex", alignItems: "center", gap: 6 }}>
                                {row.name}
                                {isMe && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, background: "#3b82f6",
                                    color: "#fff", borderRadius: 999, padding: "1px 6px",
                                  }}>YOU</span>
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: "#9ca3af" }}>{row.email}</div>
                            </td>
                            <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6" }}>
                              <span style={{
                                padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                                background: row.role === "manager" ? "#ede9fe" : "#dbeafe",
                                color: row.role === "manager" ? "#6d28d9" : "#1d4ed8",
                                textTransform: "capitalize",
                              }}>
                                {row.role}
                              </span>
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
        );
      })()}
    </div>
  );
}
