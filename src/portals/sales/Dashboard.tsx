import { useState, useEffect, useRef } from "react";
import { roleDisplayName } from "../../lib/roleLabels";
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

    </div>
  );
}
