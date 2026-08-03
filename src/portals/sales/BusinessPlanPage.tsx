import { useState, ChangeEvent, useEffect } from "react";
import { DashboardCard } from "../../components/DashboardCard";
import { UserProfile, BusinessPlan } from "../../types";
import { legacyFieldsFrom, monthlyFromLegacy, LegacyPlanFields } from "../../lib/scoreboard/goals";

// The three monthly targets (Task 1) live on the same businessPlan document in
// Mongo (src/lib/models/BusinessPlan.ts, src/lib/models/User.ts) but are not
// yet part of the shared `BusinessPlan` type in src/types.ts. Widening the
// loaded plan locally here (rather than editing the shared type) keeps this
// change confined to this one screen.
type PlanWithMonthlyTargets = BusinessPlan & {
  monthlyRevenueTarget?: number;
  monthlyKnockTarget?: number;
  monthlyClaimsTarget?: number;
};

type ScopeCopy = { heading: string; helper: string };

// Label by the logged-in user's role. `sales-team-lead` is the real database
// value for what other parts of the UI call "manager"; do not add a
// `manager` key.
const SCOPE_COPY: Record<string, ScopeCopy> = {
  sales: { heading: "My Goals", helper: "Your personal monthly targets." },
  "sales-team-lead": {
    heading: "Team Goals",
    helper: "Your team's monthly targets. This is what your team's Scoreboard measures against."
  },
  "branch-manager": { heading: "Branch Goals", helper: "Your branch's monthly targets." },
  "c-level": { heading: "Company Goals", helper: "Company-wide monthly targets." }
};

// Whole numbers only, never negative: strip anything that isn't a digit so a
// "-" or "." can never enter the field in the first place.
function sanitizeWholeNumberInput(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

// Empty means "not set" and must stay "not set": undefined, never 0.
function toWholeNumberOrUndefined(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function toInputValue(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}

export function BusinessPlanPage(props: {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
}) {
  const [loading, setLoading] = useState(true);
  // Load failed outright (network error, non-200, bad payload). Distinct from
  // "loaded fine, plan is just absent for a brand-new user". The form and its
  // save buttons only render once we know which of these two states we are
  // in, so a failed load can never fall through to a save built from blank
  // component defaults and wipe a real plan.
  const [loadError, setLoadError] = useState(false);

  // Everything the legacy Flutter planner and the admin roll-ups still read.
  // Captured from the server response and otherwise untouched by this screen.
  const [legacyFields, setLegacyFields] = useState<LegacyPlanFields>({});
  const [territories, setTerritories] = useState<string[]>([props.profile.territory || ""]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>(undefined);
  const [committed, setCommitted] = useState(false);

  // The three direct-entry monthly targets, held as raw text so an emptied
  // field is unambiguously "" rather than a coerced 0.
  const [monthlyRevenueInput, setMonthlyRevenueInput] = useState("");
  const [monthlyKnocksInput, setMonthlyKnocksInput] = useState("");
  const [monthlyClaimsInput, setMonthlyClaimsInput] = useState("");

  // Baseline for the "what changed" notification message on Submit, reset
  // after every successful save so repeated submits without edits don't keep
  // reporting a change.
  const [savedMonthlyTargets, setSavedMonthlyTargets] = useState<{
    revenue?: number;
    knocks?: number;
    claims?: number;
  }>({});

  useEffect(() => {
    let cancelled = false;

    async function loadBusinessPlan() {
      try {
        const response = await fetch(`/api/business-plan?userId=${props.profile.id}`);
        if (!response.ok) {
          if (!cancelled) setLoadError(true);
          return;
        }

        const data = await response.json();
        const userPlan = data.find((p: any) => p.userId === props.profile.id);
        const plan: PlanWithMonthlyTargets | null = userPlan?.businessPlan ?? null;
        if (cancelled) return;

        if (plan) {
          setLegacyFields({
            revenueGoal: plan.revenueGoal,
            averageDealSize: plan.averageDealSize,
            dealsPerYear: plan.dealsPerYear,
            dealsPerMonth: plan.dealsPerMonth,
            inspectionsNeeded: plan.inspectionsNeeded,
            doorsPerYear: plan.doorsPerYear,
            doorsPerDay: plan.doorsPerDay,
            daysPerWeek: plan.daysPerWeek
          });
          setTerritories(
            plan.territories && plan.territories.length > 0 ? plan.territories : [props.profile.territory || ""]
          );
          setSelectedPresetId(plan.selectedPresetId);
          setCommitted(plan.committed ?? false);

          const seededRevenue = plan.monthlyRevenueTarget ?? monthlyFromLegacy(plan.revenueGoal) ?? undefined;
          const seededKnocks = plan.monthlyKnockTarget ?? undefined;
          const seededClaims = plan.monthlyClaimsTarget ?? undefined;

          setMonthlyRevenueInput(toInputValue(seededRevenue));
          setMonthlyKnocksInput(toInputValue(seededKnocks));
          setMonthlyClaimsInput(toInputValue(seededClaims));
          setSavedMonthlyTargets({ revenue: seededRevenue, knocks: seededKnocks, claims: seededClaims });
        }
        // else: brand-new user, no plan yet. All the state above already
        // defaults to "not set" / the profile's current territory, which is
        // exactly the sensible minimal starting point.
      } catch (error) {
        console.error("Failed to load goals:", error);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadBusinessPlan();
    return () => {
      cancelled = true;
    };
  }, [props.profile.id]);

  const monthlyRevenue = toWholeNumberOrUndefined(monthlyRevenueInput);
  const monthlyKnocks = toWholeNumberOrUndefined(monthlyKnocksInput);
  const monthlyClaims = toWholeNumberOrUndefined(monthlyClaimsInput);
  const annualRevenue = monthlyRevenue !== undefined ? monthlyRevenue * 12 : undefined;

  function buildPayload(isCommitted: boolean) {
    return {
      ...legacyFieldsFrom(monthlyRevenue, legacyFields),
      territories,
      selectedPresetId,
      committed: isCommitted,
      monthlyRevenueTarget: monthlyRevenue,
      monthlyKnockTarget: monthlyKnocks,
      monthlyClaimsTarget: monthlyClaims
    };
  }

  async function savePlan(isCommitted: boolean) {
    const payload = buildPayload(isCommitted);

    await fetch("/api/business-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: props.profile.id, businessPlan: payload })
    });

    setLegacyFields(legacyFieldsFrom(monthlyRevenue, legacyFields));
    setCommitted(isCommitted);
    return payload;
  }

  async function handleSavePlan() {
    try {
      await savePlan(false);
      setSavedMonthlyTargets({ revenue: monthlyRevenue, knocks: monthlyKnocks, claims: monthlyClaims });
    } catch (error) {
      console.error("Failed to save goals:", error);
    }
  }

  async function handleCommitPlan() {
    try {
      const payload = await savePlan(true);

      const changes: string[] = [];
      if (savedMonthlyTargets.revenue !== monthlyRevenue) {
        changes.push(`Monthly Revenue Target: $${(savedMonthlyTargets.revenue || 0).toLocaleString()} to $${(monthlyRevenue || 0).toLocaleString()}`);
      }
      if (savedMonthlyTargets.knocks !== monthlyKnocks) {
        changes.push(`Monthly Door Knocks Target: ${savedMonthlyTargets.knocks || 0} to ${monthlyKnocks || 0}`);
      }
      if (savedMonthlyTargets.claims !== monthlyClaims) {
        changes.push(`Monthly Claims Target: ${savedMonthlyTargets.claims || 0} to ${monthlyClaims || 0}`);
      }
      const changeMessage = changes.length > 0 ? changes.join(", ") : "Goals submitted";

      const allUsers = await fetch("/api/users").then(r => r.json());
      const admins = allUsers.filter((u: any) => u.role === "admin");
      const notifications: any[] = [];

      if (props.profile.managerId) {
        notifications.push({
          userId: props.profile.managerId,
          type: "plan_updated",
          title: "Sales Rep Updated Goals",
          message: `${props.profile.name} updated their goals. ${changeMessage}`,
          metadata: { updatedBy: "sales", targetUser: props.profile.id }
        });
      }

      notifications.push(
        ...admins.map((admin: any) => ({
          userId: admin.id,
          type: "plan_updated",
          title: "Sales Rep Updated Goals",
          message: `${props.profile.name} updated their goals. ${changeMessage}`,
          metadata: { updatedBy: "sales", targetUser: props.profile.id }
        }))
      );

      await Promise.all(
        notifications.map(n =>
          fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(n)
          })
        )
      );

      setSavedMonthlyTargets({ revenue: monthlyRevenue, knocks: monthlyKnocks, claims: monthlyClaims });
      props.onProfileChange({
        ...props.profile,
        // The written object satisfies BusinessPlan's shape at runtime once a
        // plan exists; the shared type just hasn't been widened to know about
        // the three monthly fields (see the comment at the top of this file).
        businessPlan: payload as unknown as BusinessPlan
      });
    } catch (error) {
      console.error("Failed to submit goals:", error);
    }
  }

  if (loading) {
    return <div className="panel-empty">Loading your goals...</div>;
  }

  if (loadError) {
    return (
      <div className="panel-empty">
        Couldn't load your current goals. Please refresh the page and try again before saving, so nothing you already set gets lost.
      </div>
    );
  }

  const scope = SCOPE_COPY[props.profile.role] ?? SCOPE_COPY.sales;

  return (
    <div className="panel">
      <div className="panel-header">
        <span>{scope.heading}</span>
      </div>

      <div className="panel-body">
        <div style={{ marginBottom: 20, fontSize: 13, color: "#6b7280" }}>{scope.helper}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 320, marginBottom: 32 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 6 }}>
              Monthly Revenue Target
            </label>
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <span style={{ position: "absolute", left: 8, fontSize: 13, color: "#6b7280", fontWeight: 600 }}>$</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={monthlyRevenueInput}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setMonthlyRevenueInput(sanitizeWholeNumberInput(e.target.value))}
                placeholder="Not set"
                style={{ padding: "6px 10px 6px 22px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4, width: 150 }}
              />
            </div>
            {annualRevenue !== undefined && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                That is ${annualRevenue.toLocaleString()} per year
              </div>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 6 }}>
              Monthly Door Knocks Target
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={monthlyKnocksInput}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMonthlyKnocksInput(sanitizeWholeNumberInput(e.target.value))}
              placeholder="Not set"
              style={{ padding: "6px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4, width: 150 }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 6 }}>
              Monthly Claims Target
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={monthlyClaimsInput}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMonthlyClaimsInput(sanitizeWholeNumberInput(e.target.value))}
              placeholder="Not set"
              style={{ padding: "6px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4, width: 150 }}
            />
          </div>
        </div>

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
                Submitted Successfully
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
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
