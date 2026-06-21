import { useEffect, useState, useMemo, ChangeEvent } from "react";
import { DashboardCard } from "../../components/DashboardCard";
import { UserProfile, BusinessPlan } from "../../types";
import { useAuth } from "../../contexts/AuthContext";

export function TeamBusinessPlansPage() {
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    incomeGoal: number;
    dealAve: number;
    workingDaysPerWeek: number;
  } | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      fetchTeamData();
    }
  }, [user?.id]);

  async function fetchTeamData() {
    if (!user?.id) return;
    try {
      const usersRes = await fetch(`/api/users?role=sales&managerId=${user.id}`);
      if (usersRes.ok) {
        const team = await usersRes.json();
        // User objects already have businessPlan field!
        setTeamMembers(team);
      }
    } catch (error) {
      console.error('Failed to fetch team data:', error);
    } finally {
      setLoading(false);
    }
  }

  // Calculate metrics
  const calculateMetrics = (incomeGoal: number, dealAve: number) => {
    const dealsPerYear = dealAve > 0 ? Math.round(incomeGoal / dealAve) : 0;
    const dealsPerMonth = dealsPerYear / 12;
    const claimsPerYear = Math.round(dealsPerYear * 3);
    const claimsPerMonth = claimsPerYear / 12;
    const inspectionsPerYear = Math.round(claimsPerYear * 3);
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

  // Calculate team totals from committed plans
  const totals = useMemo(() => {
    const committedPlans = teamMembers.filter(m => m.businessPlan?.committed);
    
    return committedPlans.reduce(
      (acc, member) => {
        const bp = member.businessPlan;
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
  }, [teamMembers]);

  async function handleSave() {
    if (!editingUserId || !editForm) return;
    
    const member = teamMembers.find(m => m.id === editingUserId);
    if (!member) return;

    const metrics = calculateMetrics(editForm.incomeGoal, editForm.dealAve);

    const plan: BusinessPlan = {
      revenueGoal: editForm.incomeGoal,
      daysPerWeek: editForm.workingDaysPerWeek,
      territories: [member.territory || ""],
      averageDealSize: editForm.dealAve,
      dealsPerYear: metrics.dealsPerYear,
      dealsPerMonth: Math.round(metrics.dealsPerMonth),
      inspectionsNeeded: Math.round(metrics.inspectionsPerMonth),
      doorsPerYear: 0,
      doorsPerDay: 0,
      committed: member.businessPlan?.committed || false
    };

    try {
      await fetch('/api/business-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUserId,
          businessPlan: plan
        })
      });

      // Create notification for sales rep
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUserId,
          type: 'plan_updated',
          title: 'Business Plan Updated',
          message: `Your manager updated your business plan.`,
          metadata: { updatedBy: 'manager', businessPlan: plan }
        })
      });

      setEditingUserId(null);
      setEditForm(null);
      fetchTeamData();
    } catch (error) {
      console.error('Failed to save plan:', error);
    }
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Loading team data...</div>;
  }

  if (!user || user.role !== 'manager') {
    return <div style={{ padding: 24 }}>Access denied</div>;
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Team Business Plans</span>
      </div>
      
      <div className="panel-body">
        {/* First Row - Totals */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#111827", margin: 0, marginBottom: 16 }}>
            Team Totals
          </h3>
          
          <div className="grid grid-4" style={{ marginBottom: 24 }}>
            <DashboardCard
              title="Total Income Goal"
              value={`$${totals.incomeGoal.toLocaleString()}`}
              description="Sum of all reps"
            />
            <DashboardCard
              title="Claims Ratio"
              value="25%"
              description="Hardcoded"
            />
            <DashboardCard
              title="Inspection Ratio"
              value="30%"
              description="Hardcoded"
            />
          </div>
        </div>

        {/* Yearly Targets */}
        <div style={{ borderTop: "2px solid #e5e7eb", paddingTop: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", marginBottom: 16 }}>
            Yearly Targets
          </h3>

          <div className="grid grid-4" style={{ marginBottom: 24 }}>
            <DashboardCard
              title="Deals Per Year"
              value={totals.dealsPerYear.toLocaleString()}
              description="Total from all reps"
            />
            <DashboardCard
              title="Claims Per Year"
              value={totals.claimsPerYear.toLocaleString()}
              description="Total from all reps"
            />
            <DashboardCard
              title="Inspections Per Year"
              value={totals.inspectionsPerYear.toLocaleString()}
              description="Total from all reps"
            />
          </div>
        </div>

        {/* Monthly Targets */}
        <div style={{ borderTop: "2px solid #e5e7eb", paddingTop: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", marginBottom: 16 }}>
            Monthly Targets
          </h3>

          <div className="grid grid-4" style={{ marginBottom: 24 }}>
            <DashboardCard
              title="Deals Per Month"
              value={totals.dealsPerMonth % 1 !== 0 ? totals.dealsPerMonth.toFixed(2) : totals.dealsPerMonth.toLocaleString()}
              description="Total from all reps"
            />
            <DashboardCard
              title="Claims Per Month"
              value={totals.claimsPerMonth % 1 !== 0 ? totals.claimsPerMonth.toFixed(2) : totals.claimsPerMonth.toLocaleString()}
              description="Total from all reps"
            />
            <DashboardCard
              title="Inspections Per Month"
              value={totals.inspectionsPerMonth % 1 !== 0 ? totals.inspectionsPerMonth.toFixed(2) : totals.inspectionsPerMonth.toLocaleString()}
              description="Total from all reps"
            />
          </div>
        </div>

        {/* Sales Team Plans Table */}
        <div style={{ borderTop: "2px solid #e5e7eb", paddingTop: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", marginBottom: 16 }}>
            Sales Team Plans
          </h3>
          
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: "#f3f4f6", borderBottom: "2px solid #e5e7eb" }}>
                  <th style={{ padding: 12, textAlign: "left", fontWeight: 600, color: "#111827" }}>Rep Name</th>
                  <th style={{ padding: 12, textAlign: "right", fontWeight: 600, color: "#111827" }}>Income Goal</th>
                  <th style={{ padding: 12, textAlign: "right", fontWeight: 600, color: "#111827" }}>Deal Ave</th>
                  <th style={{ padding: 12, textAlign: "right", fontWeight: 600, color: "#111827" }}>Deals/Year</th>
                  <th style={{ padding: 12, textAlign: "right", fontWeight: 600, color: "#111827" }}>Deals/Month</th>
                  <th style={{ padding: 12, textAlign: "right", fontWeight: 600, color: "#111827" }}>Claims/Year</th>
                  <th style={{ padding: 12, textAlign: "right", fontWeight: 600, color: "#111827" }}>Claims/Month</th>
                  <th style={{ padding: 12, textAlign: "right", fontWeight: 600, color: "#111827" }}>Inspections/Year</th>
                  <th style={{ padding: 12, textAlign: "right", fontWeight: 600, color: "#111827" }}>Inspections/Month</th>
                  <th style={{ padding: 12, textAlign: "center", fontWeight: 600, color: "#111827" }}>Status</th>
                  <th style={{ padding: 12, textAlign: "center", fontWeight: 600, color: "#111827" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.length > 0 ? (
                  teamMembers.map((member, idx) => {
                    const bp = member.businessPlan;
                    const metrics = calculateMetrics(bp?.revenueGoal || 0, bp?.averageDealSize || 0);
                    
                    return (
                      <tr key={idx} style={{ borderBottom: "1px solid #e5e7eb", backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                        <td style={{ padding: 12, color: "#111827", fontWeight: 500 }}>{member.name}</td>
                        <td style={{ padding: 12, textAlign: "right", color: "#374151" }}>${(bp?.revenueGoal || 0).toLocaleString()}</td>
                        <td style={{ padding: 12, textAlign: "right", color: "#374151" }}>${(bp?.averageDealSize || 0).toLocaleString()}</td>
                        <td style={{ padding: 12, textAlign: "right", color: "#374151" }}>{metrics.dealsPerYear.toLocaleString()}</td>
                        <td style={{ padding: 12, textAlign: "right", color: "#374151" }}>{metrics.dealsPerMonth.toFixed(2)}</td>
                        <td style={{ padding: 12, textAlign: "right", color: "#374151" }}>{metrics.claimsPerYear.toLocaleString()}</td>
                        <td style={{ padding: 12, textAlign: "right", color: "#374151" }}>{metrics.claimsPerMonth.toFixed(2)}</td>
                        <td style={{ padding: 12, textAlign: "right", color: "#374151" }}>{metrics.inspectionsPerYear.toLocaleString()}</td>
                        <td style={{ padding: 12, textAlign: "right", color: "#374151" }}>{metrics.inspectionsPerMonth.toFixed(2)}</td>
                        <td style={{ padding: 12, textAlign: "center" }}>
                          <span style={{ padding: "4px 8px", backgroundColor: bp?.committed ? "#d1fae5" : "#fef3c7", color: bp?.committed ? "#065f46" : "#78350f", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                            {bp?.committed ? "Committed" : "Draft"}
                          </span>
                        </td>
                        <td style={{ padding: 12, textAlign: "center" }}>
                          <button
                            onClick={() => {
                              setEditingUserId(member.id);
                              setEditForm({
                                incomeGoal: bp?.revenueGoal || 0,
                                dealAve: bp?.averageDealSize || 0,
                                workingDaysPerWeek: bp?.daysPerWeek || 5
                              });
                            }}
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "#3b82f6",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: 4,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer"
                            }}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>
                      No team members assigned
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingUserId && editForm && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }} onClick={() => setEditingUserId(null)}>
          <div style={{
            backgroundColor: "#ffffff",
            borderRadius: 8,
            padding: 24,
            width: "90%",
            maxWidth: 500,
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#111827", margin: 0, marginBottom: 20 }}>
              Edit Plan - {teamMembers.find(m => m.id === editingUserId)?.name}
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <label className="field">
                <span className="field-label">Income Goal</span>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <span style={{ position: "absolute", left: 12, fontSize: 13, color: "#6b7280", fontWeight: 600 }}>$</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={editForm.incomeGoal}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setEditForm({ ...editForm, incomeGoal: Number(e.target.value) });
                    }}
                    style={{ width: "100%", padding: "10px 12px 10px 28px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6 }}
                  />
                </div>
              </label>

              <label className="field">
                <span className="field-label">Deal Ave</span>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <span style={{ position: "absolute", left: 12, fontSize: 13, color: "#6b7280", fontWeight: 600 }}>$</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={editForm.dealAve}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setEditForm({ ...editForm, dealAve: Number(e.target.value) });
                    }}
                    style={{ width: "100%", padding: "10px 12px 10px 28px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6 }}
                  />
                </div>
              </label>

              <label className="field">
                <span className="field-label">Working Days Per Week</span>
                <input
                  type="number"
                  min={1}
                  max={7}
                  step={0.5}
                  value={editForm.workingDaysPerWeek}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const value = Number(e.target.value);
                    if (value >= 1 && value <= 7) {
                      setEditForm({ ...editForm, workingDaysPerWeek: value });
                    }
                  }}
                  style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6 }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setEditingUserId(null)}
                style={{
                  padding: "10px 24px",
                  backgroundColor: "#e5e7eb",
                  color: "#111827",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: "10px 24px",
                  backgroundColor: "#3b82f6",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
