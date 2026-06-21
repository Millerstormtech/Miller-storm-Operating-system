import { useState, useMemo, ChangeEvent, useEffect } from "react";
import { DashboardCard } from "../../components/DashboardCard";
import { UserProfile, BusinessPlan } from "../../types";

// Business logic calculations
const calculateMetrics = (incomeGoal: number, dealAve: number, workingDaysPerWeek: number) => {
  // Deals Per Year = Income Goal / Deal Ave
  const dealsPerYear = dealAve > 0 ? Math.round(incomeGoal / dealAve) : 0;
  
  // Deals Per Month = Deals Per Year / 12
  const dealsPerMonth = dealsPerYear / 12;
  
  // Claims Per Year = Deals Per Year * 3
  const claimsPerYear = Math.round(dealsPerYear * 3);
  
  // Claims Per Month = Claims Per Year / 12
  const claimsPerMonth = claimsPerYear / 12;
  
  // Inspections Per Year = Claims Per Year * 3
  const inspectionsPerYear = Math.round(claimsPerYear * 3);
  
  // Inspections Per Month = Inspections Per Year / 12
  const inspectionsPerMonth = inspectionsPerYear / 12;

  return {
    dealsPerYear,
    dealsPerMonth,
    claimsPerYear,
    claimsPerMonth,
    inspectionsPerYear,
    inspectionsPerMonth,
    workingDaysPerWeek
  };
};

export function BusinessPlanPage(props: {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
}) {
  const [existingPlan, setExistingPlan] = useState<BusinessPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [incomeGoal, setIncomeGoal] = useState(100000);
  const [dealAve, setDealAve] = useState(3800);
  const [workingDaysPerWeek, setWorkingDaysPerWeek] = useState(5);
  const [saved, setSaved] = useState(false);
  const [committed, setCommitted] = useState(false);

  // Load user's business plan from database
  useEffect(() => {
    async function loadBusinessPlan() {
      try {
        console.log('🔍 Loading business plan for user:', props.profile.id);
        console.log('📋 Full profile:', props.profile);
        
        const response = await fetch(`/api/business-plan?userId=${props.profile.id}`);
        console.log('📡 API Response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('📦 Received data:', data);
          
          const userPlan = data.find((plan: any) => plan.userId === props.profile.id);
          console.log('🎯 Found plan:', userPlan);
          
          if (userPlan?.businessPlan) {
            setExistingPlan(userPlan.businessPlan);
            setIncomeGoal(userPlan.businessPlan.revenueGoal || 100000);
            setDealAve(userPlan.businessPlan.averageDealSize || 3800);
            setWorkingDaysPerWeek(userPlan.businessPlan.daysPerWeek || 5);
            setCommitted(userPlan.businessPlan.committed || false);
            setSaved(true);
          }
        } else {
          const errorData = await response.json();
          console.error('❌ API Error:', errorData);
        }
      } catch (error) {
        console.error('❌ Failed to load business plan:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadBusinessPlan();
  }, [props.profile.id]);

  const metrics = useMemo(() => {
    return calculateMetrics(incomeGoal, dealAve, workingDaysPerWeek);
  }, [incomeGoal, dealAve, workingDaysPerWeek]);

  async function handleSavePlan() {
    const plan: BusinessPlan = {
      revenueGoal: incomeGoal,
      daysPerWeek: workingDaysPerWeek,
      territories: [props.profile.territory || ""],
      averageDealSize: dealAve,
      dealsPerYear: metrics.dealsPerYear,
      dealsPerMonth: Math.round(metrics.dealsPerMonth),
      inspectionsNeeded: Math.round(metrics.inspectionsPerMonth),
      doorsPerYear: 0,
      doorsPerDay: 0,
      committed: false
    };

    try {
      await fetch('/api/business-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: props.profile.id,
          businessPlan: plan
        })
      });

      setExistingPlan(plan);
      setSaved(true);
      setCommitted(false);
    } catch (error) {
      console.error('Failed to save business plan:', error);
    }
  }

  async function handleCommitPlan() {
    const plan: BusinessPlan = {
      revenueGoal: incomeGoal,
      daysPerWeek: workingDaysPerWeek,
      territories: [props.profile.territory || ""],
      averageDealSize: dealAve,
      dealsPerYear: metrics.dealsPerYear,
      dealsPerMonth: Math.round(metrics.dealsPerMonth),
      inspectionsNeeded: Math.round(metrics.inspectionsPerMonth),
      doorsPerYear: 0,
      doorsPerDay: 0,
      committed: true
    };

    try {
      // Save to database
      await fetch('/api/business-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: props.profile.id,
          businessPlan: plan
        })
      });

      // Build change details
      const changes: string[] = [];
      if (existingPlan?.revenueGoal !== plan.revenueGoal) {
        changes.push(`Income Goal: ${existingPlan?.revenueGoal?.toLocaleString() || 0} → ${plan.revenueGoal?.toLocaleString()}`);
      }
      if (existingPlan?.averageDealSize !== plan.averageDealSize) {
        changes.push(`Deal Ave: ${existingPlan?.averageDealSize?.toLocaleString() || 0} → ${plan.averageDealSize?.toLocaleString()}`);
      }
      if (existingPlan?.daysPerWeek !== plan.daysPerWeek) {
        changes.push(`Working Days/Week: ${existingPlan?.daysPerWeek || 0} → ${plan.daysPerWeek}`);
      }
      const changeMessage = changes.length > 0 ? changes.join(', ') : 'Plan committed';

      // Create notifications for manager and admins
      const allUsers = await fetch('/api/users').then(r => r.json());
      const admins = allUsers.filter((u: any) => u.role === 'admin');
      const notifications = [];

      if (props.profile.managerId) {
        notifications.push({
          userId: props.profile.managerId,
          type: 'plan_updated',
          title: 'Sales Rep Updated Plan',
          message: `${props.profile.name} updated their business plan. ${changeMessage}`,
          metadata: { updatedBy: 'sales', targetUser: props.profile.id }
        });
      }

      notifications.push(
        ...admins.map((admin: any) => ({
          userId: admin.id,
          type: 'plan_updated',
          title: 'Sales Rep Updated Plan',
          message: `${props.profile.name} updated their business plan. ${changeMessage}`,
          metadata: { updatedBy: 'sales', targetUser: props.profile.id }
        }))
      );

      await Promise.all(
        notifications.map(n => 
          fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(n)
          })
        )
      );

      props.onProfileChange({
        ...props.profile,
        businessPlan: plan
      });
      setCommitted(true);
    } catch (error) {
      console.error('Failed to commit business plan:', error);
    }
  }

  if (loading) {
    return <div className="panel-empty">Loading your business plan...</div>;
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span>My Business Plan - {props.profile.name}</span>
      </div>
      
      <div className="panel-body">
        {/* My Inputs Table */}
        <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>My Inputs:</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 32 }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #d1d5db", padding: "10px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, backgroundColor: "#f9fafb" }}>Income Goal</th>
              <th style={{ border: "1px solid #d1d5db", padding: "10px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, backgroundColor: "#f9fafb" }}>Deal Average</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: "1px solid #d1d5db", padding: "10px 16px", textAlign: "center" }}>
                <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                  <span style={{ position: "absolute", left: 8, fontSize: 13, color: "#6b7280", fontWeight: 600 }}>$</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={incomeGoal}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setIncomeGoal(Number(e.target.value))}
                    style={{ padding: "6px 10px 6px 22px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4, width: 150, textAlign: "center" }}
                  />
                </div>
              </td>
              <td style={{ border: "1px solid #d1d5db", padding: "10px 16px", textAlign: "center" }}>
                <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                  <span style={{ position: "absolute", left: 8, fontSize: 13, color: "#6b7280", fontWeight: 600 }}>$</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={dealAve}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setDealAve(Number(e.target.value))}
                    style={{ padding: "6px 10px 6px 22px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4, width: 150, textAlign: "center" }}
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Hardcoded Ratios Display */}
        <div style={{ display: "none", marginBottom: 32, gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ padding: 12, backgroundColor: "#fce7f3", borderRadius: 8, border: "1px solid #ec4899" }}>
            <div style={{ fontSize: 11, color: "#831843", fontWeight: 600, marginBottom: 4 }}>Claims Ratio</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#831843" }}>25%</div>
          </div>
          <div style={{ padding: 12, backgroundColor: "#fef3c7", borderRadius: 8, border: "1px solid #f59e0b" }}>
            <div style={{ fontSize: 11, color: "#78350f", fontWeight: 600, marginBottom: 4 }}>Inspection Ratio</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#78350f" }}>30%</div>
          </div>
        </div>

        {/* Yearly Goals Table */}
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600, color: "#111827" }}>Yearly Goals</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 32 }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #d1d5db", padding: "10px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, backgroundColor: "#f9fafb" }}>Deals</th>
              <th style={{ border: "1px solid #d1d5db", padding: "10px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, backgroundColor: "#f9fafb" }}>Claims</th>
              <th style={{ border: "1px solid #d1d5db", padding: "10px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, backgroundColor: "#f9fafb" }}>Inspections</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: "1px solid #d1d5db", padding: "12px 16px", textAlign: "center", fontSize: 15, fontWeight: 600 }}>{metrics.dealsPerYear.toLocaleString()}</td>
              <td style={{ border: "1px solid #d1d5db", padding: "12px 16px", textAlign: "center", fontSize: 15, fontWeight: 600 }}>{metrics.claimsPerYear.toLocaleString()}</td>
              <td style={{ border: "1px solid #d1d5db", padding: "12px 16px", textAlign: "center", fontSize: 15, fontWeight: 600 }}>{metrics.inspectionsPerYear.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        {/* Monthly Goals Table */}
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600, color: "#111827" }}>Monthly Goals</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 32 }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #d1d5db", padding: "10px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, backgroundColor: "#f9fafb" }}>Deals</th>
              <th style={{ border: "1px solid #d1d5db", padding: "10px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, backgroundColor: "#f9fafb" }}>Claims</th>
              <th style={{ border: "1px solid #d1d5db", padding: "10px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, backgroundColor: "#f9fafb" }}>Inspections</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: "1px solid #d1d5db", padding: "12px 16px", textAlign: "center", fontSize: 15, fontWeight: 600 }}>{Math.ceil(metrics.dealsPerMonth).toLocaleString()}</td>
              <td style={{ border: "1px solid #d1d5db", padding: "12px 16px", textAlign: "center", fontSize: 15, fontWeight: 600 }}>{Math.ceil(metrics.claimsPerMonth).toLocaleString()}</td>
              <td style={{ border: "1px solid #d1d5db", padding: "12px 16px", textAlign: "center", fontSize: 15, fontWeight: 600 }}>{Math.ceil(metrics.inspectionsPerMonth).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        {/* Commitment Section */}
        <div style={{ borderTop: "2px solid #e5e7eb", paddingTop: 24, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {committed && (
              <span style={{
                padding: "6px 12px",
                backgroundColor: "#d1fae5",
                color: "#065f46",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600
              }}>
                ✓ Submitted Successfully
              </span>
            )}
            <button
              className="btn-primary"
              onClick={handleSavePlan}
              style={{ padding: "10px 24px", fontSize: 13, fontWeight: 600, backgroundColor: "#f59e0b" }}
            >
              Save as Draft
            </button>
            <button
              className="btn-primary"
              onClick={handleCommitPlan}
              style={{ padding: "10px 24px", fontSize: 13, fontWeight: 600 }}
            >
              {committed ? "Submit" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
