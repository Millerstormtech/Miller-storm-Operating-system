import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Sidebar } from "../components/Sidebar";
import { Header } from "../components/Header";
import { DashboardCard } from "../components/DashboardCard";
import { AuthenticatedUser, BusinessPlan, Course, UserProfile } from "../types";

type ManagerPortalProps = {
  currentUser: AuthenticatedUser;
  teamMembers: UserProfile[];
  courses: Course[];
  onTeamMembersChange: (members: UserProfile[]) => void;
  onLogout: () => void;
};

type ManagerViewId =
  | "dashboard"
  | "team"
  | "plans"
  | "training"
  | "onlineTraining"
  | "taskTracker";

type AssignedTask = {
  id: string;
  userId: string;
  label: string;
  status: "open" | "completed";
};

const sidebarItems: { id: ManagerViewId; label: string }[] = [
  { id: "dashboard", label: "My Dashboard" },
  { id: "team", label: "My Team" },
  { id: "plans", label: "Team Business Plans" },
  { id: "training", label: "Team Training Progress" },
  { id: "onlineTraining", label: "Online Course Training" },
  { id: "taskTracker", label: "Task Tracker" }
];

function ManagerDashboard(props: { teamMembers: UserProfile[] }) {
  const repCount = props.teamMembers.length;
  const totals = props.teamMembers.reduce(
    (acc, member) => {
      const plan = member.businessPlan;
      if (!plan) {
        return acc;
      }
      acc.incomeGoal += plan.revenueGoal;
      acc.dealsNeeded += plan.dealsPerYear;
      acc.inspectionsNeeded += plan.inspectionsNeeded;
      acc.doorsNeeded += plan.doorsPerYear;
      return acc;
    },
    {
      incomeGoal: 0,
      dealsNeeded: 0,
      inspectionsNeeded: 0,
      doorsNeeded: 0
    }
  );

  const claimsNeeded = Math.ceil(totals.dealsNeeded * 1.2);
  const convosNeeded = Math.ceil(totals.inspectionsNeeded * 2.5);

  const incomeActual = repCount * 84000;
  const dealsActual = repCount * 6;
  const claimsActual = repCount * 8;
  const inspectionsActual = repCount * 32;
  const convosActual = repCount * 85;
  const doorsActual = repCount * 420;

  const incomeDelta = incomeActual - totals.incomeGoal;
  const dealsDelta = dealsActual - totals.dealsNeeded;
  const claimsDelta = claimsActual - claimsNeeded;
  const inspectionsDelta = inspectionsActual - totals.inspectionsNeeded;
  const convosDelta = convosActual - convosNeeded;
  const doorsDelta = doorsActual - totals.doorsNeeded;

  return (
    <div className="sales-dashboard">
      <div className="sales-plan-heading">
        <div className="sales-plan-summary-main">
          <div className="sales-plan-summary-name">Team Goals</div>
        </div>
      </div>
      <div className="grid grid-4">
        <DashboardCard
          title="Income Goal"
          value={`$${totals.incomeGoal.toLocaleString()}`}
        />
        <DashboardCard
          title="Deals Needed"
          value={totals.dealsNeeded.toLocaleString()}
        />
        <DashboardCard
          title="Claims Needed"
          value={claimsNeeded.toLocaleString()}
        />
        <DashboardCard
          title="Inspections Needed"
          value={totals.inspectionsNeeded.toLocaleString()}
        />
        <DashboardCard
          title="Convos Needed"
          value={convosNeeded.toLocaleString()}
        />
        <DashboardCard
          title="Doors Needed"
          value={totals.doorsNeeded.toLocaleString()}
        />
      </div>
      <div className="sales-plan-heading">
        <div className="sales-plan-summary-main">
          <div className="sales-plan-summary-name">Team Actuals</div>
        </div>
      </div>
      <div className="grid grid-4">
        <DashboardCard
          title="Income Actual"
          value={`$${incomeActual.toLocaleString()}`}
        />
        <DashboardCard
          title="Deals Actual"
          value={dealsActual.toLocaleString()}
        />
        <DashboardCard
          title="Claims Actual"
          value={claimsActual.toLocaleString()}
        />
        <DashboardCard
          title="Inspections Actual"
          value={inspectionsActual.toLocaleString()}
        />
        <DashboardCard
          title="Convos Actual"
          value={convosActual.toLocaleString()}
        />
        <DashboardCard
          title="Doors Actual"
          value={doorsActual.toLocaleString()}
        />
      </div>
      <div className="sales-plan-heading">
        <div className="sales-plan-summary-main">
          <div className="sales-plan-summary-name">Team Delta</div>
        </div>
      </div>
      <div className="grid grid-4">
        <DashboardCard
          title="Income Delta"
          value={`$${incomeDelta.toLocaleString()}`}
        />
        <DashboardCard
          title="Deals Delta"
          value={dealsDelta.toLocaleString()}
        />
        <DashboardCard
          title="Claims Delta"
          value={claimsDelta.toLocaleString()}
        />
        <DashboardCard
          title="Inspections Delta"
          value={inspectionsDelta.toLocaleString()}
        />
        <DashboardCard
          title="Convos Delta"
          value={convosDelta.toLocaleString()}
        />
        <DashboardCard
          title="Doors Delta"
          value={doorsDelta.toLocaleString()}
        />
      </div>
    </div>
  );
}

function TeamPage(props: {
  teamMembers: UserProfile[];
  onTeamMembersChange: (members: UserProfile[]) => void;
}) {
  const [selectedId, setSelectedId] = useState(
    props.teamMembers[0]?.id ?? ""
  );
  const [profiles, setProfiles] = useState<UserProfile[]>(props.teamMembers);
  const [search, setSearch] = useState("");

  const filteredProfiles = profiles.filter((member) => {
    const term = search.toLowerCase().trim();
    if (!term) {
      return true;
    }
    const name = member.name.toLowerCase();
    const territory = (member.territory ?? "").toLowerCase();
    const role = member.role.toLowerCase();
    return (
      name.includes(term) ||
      territory.includes(term) ||
      role.includes(term)
    );
  });

  const selected =
    profiles.find((m) => m.id === selectedId) ?? filteredProfiles[0] ?? null;

  useEffect(() => {
    setProfiles(props.teamMembers);
    if (!props.teamMembers.find((m) => m.id === selectedId)) {
      setSelectedId(props.teamMembers[0]?.id ?? "");
    }
  }, [props.teamMembers, selectedId]);

  function updateProfile(updated: UserProfile) {
    const nextProfiles = profiles.map((m) =>
      m.id === updated.id ? updated : m
    );
    setProfiles(nextProfiles);
    props.onTeamMembersChange(nextProfiles);
  }

  return (
    <div className="admin-user-management">
      <div className="panel panel-left">
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Team</span>
            <div className="panel-header-actions">
              <input
                className="field-input"
                placeholder="Search team members"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="panel-body list">
          {filteredProfiles.map((member) => {
            const isActive = member.id === selectedId;
            return (
              <button
                key={member.id}
                className={isActive ? "list-item active" : "list-item"}
                onClick={() => setSelectedId(member.id)}
              >
                <div className="list-item-title">{member.name}</div>
                <div className="list-item-subtitle">
                  {member.role.toUpperCase()} • {member.territory}
                </div>
              </button>
            );
          })}
          {filteredProfiles.length === 0 && (
            <div className="panel-empty">No team members match your search.</div>
          )}
        </div>
      </div>
      <div className="panel panel-right">
        {selected ? (
          <div className="panel-scroll">
            <div className="panel-header">Rep Profile</div>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Strengths / Superpowers</span>
                <textarea
                  className="field-input"
                  rows={3}
                  value={selected.strengths}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      strengths: e.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Weaknesses / Insecurities</span>
                <textarea
                  className="field-input"
                  rows={3}
                  value={selected.weaknesses}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      weaknesses: e.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Web Page Mission Title</span>
                <input
                  className="field-input"
                  value={selected.missionTitle ?? ""}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      missionTitle: e.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Web Page Mission Body</span>
                <textarea
                  className="field-input"
                  rows={3}
                  value={selected.missionBody ?? ""}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      missionBody: e.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Web Page Mission CTA</span>
                <input
                  className="field-input"
                  value={selected.missionCtaLabel ?? ""}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      missionCtaLabel: e.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Web Page Mission Image URL</span>
                <input
                  className="field-input"
                  value={selected.missionImageUrl ?? ""}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      missionImageUrl: e.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Web Page Mission Title</span>
                <input
                  className="field-input"
                  value={selected.missionTitle ?? ""}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      missionTitle: e.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Web Page Mission Body</span>
                <textarea
                  className="field-input"
                  rows={3}
                  value={selected.missionBody ?? ""}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      missionBody: e.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Web Page Mission CTA</span>
                <input
                  className="field-input"
                  value={selected.missionCtaLabel ?? ""}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      missionCtaLabel: e.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Web Page Mission Image URL</span>
                <input
                  className="field-input"
                  value={selected.missionImageUrl ?? ""}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      missionImageUrl: e.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Why You Need Us Title</span>
                <input
                  className="field-input"
                  value={selected.whyUsTitle ?? ""}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      whyUsTitle: e.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Why You Need Us Body</span>
                <textarea
                  className="field-input"
                  rows={3}
                  value={selected.whyUsBody ?? ""}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      whyUsBody: e.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Expert Roofers Title</span>
                <input
                  className="field-input"
                  value={selected.expertRoofersTitle ?? ""}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      expertRoofersTitle: e.target.value
                    })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Expert Roofers Body</span>
                <textarea
                  className="field-input"
                  rows={3}
                  value={selected.expertRoofersBody ?? ""}
                  onChange={(e) =>
                    updateProfile({
                      ...selected,
                      expertRoofersBody: e.target.value
                    })
                  }
                />
              </label>
            </div>
            <div className="panel-section">
              <div className="panel-section-title">Approvals</div>
              <div className="list">
                <div className="list-item">
                  <div className="list-item-title">
                    Marketing Materials Approval
                  </div>
                  <div className="list-item-subtitle">
                    Approve or reject rep-submitted assets.
                  </div>
                  <div className="list-item-actions">
                    <button className="btn-secondary">Approve</button>
                    <button className="btn-ghost">Reject</button>
                  </div>
                </div>
                <div className="list-item">
                  <div className="list-item-title">Rep Web Page Approval</div>
                  <div className="list-item-subtitle">
                    Review copy, links, and compliance items.
                  </div>
                  <div className="list-item-actions">
                    <button className="btn-secondary">Approve</button>
                    <button className="btn-ghost">Request Changes</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="panel-empty">Select a team member.</div>
        )}
      </div>
    </div>
  );
}

function recomputeBusinessPlan(plan: BusinessPlan): BusinessPlan {
  const averageDealSize = plan.averageDealSize ?? 12000;
  const inspectionToDealRate = 0.4;
  const doorsToInspectionRate = 0.08;

  const dealsPerYear =
    averageDealSize > 0
      ? Math.ceil(plan.revenueGoal / averageDealSize)
      : 0;
  const dealsPerMonth = Math.ceil(dealsPerYear / 12);
  const inspectionsNeeded =
    dealsPerYear > 0
      ? Math.ceil(dealsPerYear / inspectionToDealRate)
      : 0;
  const doorsPerYear =
    inspectionsNeeded > 0
      ? Math.ceil(inspectionsNeeded / doorsToInspectionRate)
      : 0;
  const weeksPerYear = 52;
  const doorsPerDay =
    plan.daysPerWeek > 0
      ? Math.ceil(doorsPerYear / (weeksPerYear * plan.daysPerWeek))
      : 0;

  return {
    ...plan,
    averageDealSize,
    dealsPerYear,
    dealsPerMonth,
    inspectionsNeeded,
    doorsPerYear,
    doorsPerDay
  };
}

function TeamBusinessPlansPage(props: {
  teamMembers: UserProfile[];
  onTeamMembersChange: (members: UserProfile[]) => void;
}) {
  const [profiles, setProfiles] = useState<UserProfile[]>(props.teamMembers);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [draftPlan, setDraftPlan] = useState<BusinessPlan | null>(null);

  useEffect(() => {
    setProfiles(props.teamMembers);
  }, [props.teamMembers]);

  function ensurePlan(member: UserProfile): BusinessPlan {
    const existing = member.businessPlan;
    if (existing) {
      return {
        ...existing,
        averageDealSize: existing.averageDealSize ?? 12000
      };
    }
    const base: BusinessPlan = {
      revenueGoal: 100000,
      daysPerWeek: 5,
      territories:
        member.territory && member.territory.length > 0
          ? [member.territory]
          : [],
      selectedPresetId: undefined,
      averageDealSize: 12000,
      dealsPerYear: 0,
      dealsPerMonth: 0,
      inspectionsNeeded: 0,
      doorsPerYear: 0,
      doorsPerDay: 0,
      committed: false
    };
    return recomputeBusinessPlan(base);
  }

  function startEditing(member: UserProfile) {
    const basePlan = ensurePlan(member);
    setEditingMemberId(member.id);
    setDraftPlan(basePlan);
  }

  function cancelEditing() {
    setEditingMemberId(null);
    setDraftPlan(null);
  }

  function saveEditing(memberId: string) {
    if (!draftPlan || editingMemberId !== memberId) {
      return;
    }
    updatePlanForMember(memberId, {
      revenueGoal: draftPlan.revenueGoal,
      daysPerWeek: draftPlan.daysPerWeek,
      averageDealSize: draftPlan.averageDealSize
    });
    setEditingMemberId(null);
    setDraftPlan(null);
  }

  function updateDraftPlan(values: Partial<BusinessPlan>) {
    if (!draftPlan) {
      return;
    }
    const merged: BusinessPlan = { ...draftPlan, ...values };
    const recomputed = recomputeBusinessPlan(merged);
    setDraftPlan(recomputed);
  }

  function updatePlanForMember(
    memberId: string,
    updates: Partial<BusinessPlan>
  ) {
    setProfiles((prev) => {
      const nextProfiles = prev.map((member) => {
        if (member.id !== memberId) {
          return member;
        }
        const withPlan = ensurePlan(member);
        const merged: BusinessPlan = {
          ...withPlan,
          ...updates
        };
        const recomputed = recomputeBusinessPlan(merged);
        return {
          ...member,
          businessPlan: recomputed
        };
      });
      props.onTeamMembersChange(nextProfiles);
      return nextProfiles;
    });
  }

  const totals = profiles.reduce(
    (acc, member) => {
      const plan = member.businessPlan;
      if (!plan) {
        return acc;
      }
      acc.revenueGoal += plan.revenueGoal;
      acc.dealsPerYear += plan.dealsPerYear;
      acc.inspectionsNeeded += plan.inspectionsNeeded;
      acc.doorsPerYear += plan.doorsPerYear;
      return acc;
    },
    {
      revenueGoal: 0,
      dealsPerYear: 0,
      inspectionsNeeded: 0,
      doorsPerYear: 0
    }
  );

  return (
    <div>
      <div className="grid grid-4">
        <DashboardCard
          title="Team Revenue Goal"
          value={`$${totals.revenueGoal.toLocaleString()}`}
          description="Sum of rep plans"
        />
        <DashboardCard
          title="Deals Needed (Year)"
          value={totals.dealsPerYear.toLocaleString()}
          description="Across all reps"
        />
        <DashboardCard
          title="Inspections Needed"
          value={totals.inspectionsNeeded.toLocaleString()}
          description="From plan assumptions"
        />
        <DashboardCard
          title="Door Knocks (Year)"
          value={totals.doorsPerYear.toLocaleString()}
          description="Team goal"
        />
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Team Business Plans</span>
          </div>
        </div>
        <div className="panel-body">
          {profiles.length === 0 ? (
            <div className="panel-empty">
              No team members yet. Assign sales reps to this manager.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  minWidth: 1040
                }}
              >
                <thead>
                  <tr
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#6b7280"
                    }}
                  >
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "left"
                      }}
                    >
                      Rep
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "center"
                      }}
                    >
                      Revenue Goal
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "center"
                      }}
                    >
                      Avg Rev / Deal
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "center"
                      }}
                    >
                      Deals / Year
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "center"
                      }}
                    >
                      Deals / Month
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "center"
                      }}
                    >
                      Inspections Needed
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "center"
                      }}
                    >
                      Door Knocks / Year
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "center"
                      }}
                    >
                      Days / Week
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "center"
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((member, index) => {
                    const plan = member.businessPlan
                      ? {
                          ...member.businessPlan,
                          averageDealSize:
                            member.businessPlan.averageDealSize ?? 12000
                        }
                      : ensurePlan(member);
                    const isEditing = editingMemberId === member.id;
                    const displayPlan =
                      isEditing && draftPlan ? draftPlan : plan;
                    return (
                      <tr
                        key={member.id}
                        style={{
                          fontSize: 13,
                          backgroundColor:
                            index % 2 === 0 ? "#ffffff" : "#f9fafb",
                          borderTop:
                            index === 0
                              ? "1px solid #e5e7eb"
                              : "1px solid #f1f5f9"
                        }}
                      >
                        <td style={{ padding: "8px 12px" }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {member.name}
                          </div>
                          <div style={{ fontSize: 11, color: "#6b7280" }}>
                            {member.role.toUpperCase()} •{" "}
                            {member.territory ?? "No territory"}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            verticalAlign: "middle",
                            textAlign: "center"
                          }}
                        >
                          {isEditing ? (
                            <input
                              type="number"
                              className="field-input"
                              style={{
                                fontSize: 12,
                                padding: "4px 8px",
                                width: "100%",
                                maxWidth: 140
                              }}
                              value={displayPlan.revenueGoal}
                              onChange={(e) =>
                                updateDraftPlan({
                                  revenueGoal: Number(e.target.value) || 0
                                })
                              }
                            />
                          ) : (
                            <div
                              style={{
                                fontSize: 13,
                                whiteSpace: "nowrap",
                                textAlign: "center"
                              }}
                            >
                              ${displayPlan.revenueGoal.toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            verticalAlign: "middle",
                            textAlign: "center"
                          }}
                        >
                          {isEditing ? (
                            <input
                              type="number"
                              className="field-input"
                              style={{
                                fontSize: 12,
                                padding: "4px 8px",
                                width: "100%",
                                maxWidth: 140
                              }}
                              value={displayPlan.averageDealSize ?? 0}
                              onChange={(e) =>
                                updateDraftPlan({
                                  averageDealSize:
                                    Number(e.target.value) || 0
                                })
                              }
                            />
                          ) : (
                            <div
                              style={{
                                fontSize: 13,
                                whiteSpace: "nowrap",
                                textAlign: "center"
                              }}
                            >
                              ${(
                                displayPlan.averageDealSize ?? 0
                              ).toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            verticalAlign: "middle",
                            textAlign: "center"
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              whiteSpace: "nowrap"
                            }}
                          >
                            {displayPlan.dealsPerYear.toLocaleString()}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            verticalAlign: "middle",
                            textAlign: "center"
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              whiteSpace: "nowrap"
                            }}
                          >
                            {displayPlan.dealsPerMonth.toLocaleString()}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            verticalAlign: "middle",
                            textAlign: "center"
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              whiteSpace: "nowrap"
                            }}
                          >
                            {displayPlan.inspectionsNeeded.toLocaleString()}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            verticalAlign: "middle",
                            textAlign: "center"
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              whiteSpace: "nowrap"
                            }}
                          >
                            {displayPlan.doorsPerYear.toLocaleString()}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            verticalAlign: "middle"
                          }}
                        >
                          {isEditing ? (
                            <input
                              type="number"
                              className="field-input"
                              style={{
                                fontSize: 12,
                                padding: "4px 8px",
                                textAlign: "center",
                                width: "100%",
                                maxWidth: 100
                              }}
                              value={displayPlan.daysPerWeek}
                              onChange={(e) =>
                                updateDraftPlan({
                                  daysPerWeek: Number(e.target.value) || 0
                                })
                              }
                            />
                          ) : (
                            <div
                              style={{
                                fontSize: 13,
                                textAlign: "center",
                                whiteSpace: "nowrap"
                              }}
                            >
                              {displayPlan.daysPerWeek.toString()}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            verticalAlign: "middle",
                            textAlign: "center",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="btn-primary btn-success"
                                style={{ marginRight: 8 }}
                                onClick={() => saveEditing(member.id)}
                              >
                                Send
                              </button>
                              <button
                                type="button"
                                className="btn-secondary btn-cancel"
                                onClick={cancelEditing}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => startEditing(member)}
                            >
                              Edit
                            </button>
                          )}
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

function TeamTrainingProgressPage(props: {
  currentUser: AuthenticatedUser;
  teamMembers: UserProfile[];
  courses: Course[];
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const publishedCourses = props.courses.filter(
    (course) => course.status !== "draft"
  );

  function getCourseCompletion(member: UserProfile, course: Course) {
    const memberCode =
      (member.id.charCodeAt(0) || 0) + (member.name.charCodeAt(0) || 0);
    const courseCode = course.id.charCodeAt(0) || 0;
    const raw = (memberCode * 7 + courseCode * 3) % 101;
    return raw;
  }

  const memberProgress = props.teamMembers.map((member) => {
    const coursePercentages = publishedCourses.map((course) =>
      getCourseCompletion(member, course)
    );
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

  function getManagerCourseCompletion(course: Course) {
    const userCode =
      (props.currentUser.id.charCodeAt(0) || 0) +
      (props.currentUser.name.charCodeAt(0) || 0);
    const courseCode = course.id.charCodeAt(0) || 0;
    const raw = (userCode * 5 + courseCode * 11) % 101;
    return raw;
  }

  const managerCoursePercentages = publishedCourses.map((course) =>
    getManagerCourseCompletion(course)
  );

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

function TaskTracker(props: { teamMembers: UserProfile[]; courses: Course[] }) {
  const [selection, setSelection] = useState<
    Record<
      string,
      {
        profile: boolean;
        plan: boolean;
        modules: Record<string, boolean>;
      }
    >
  >({});
  const [tasks, setTasks] = useState<AssignedTask[]>([]);

  function getProfileCompletion(member: UserProfile) {
    const hasHeadshot =
      typeof member.headshotUrl === "string" &&
      member.headshotUrl.trim().length > 0;
    return hasHeadshot ? 100 : 75;
  }

  function getBusinessPlanCompletion(member: UserProfile) {
    const plan = member.businessPlan;
    if (!plan) {
      return 0;
    }
    if (plan.committed) {
      return 100;
    }
    return 75;
  }

  function getModuleCompletion(_member: UserProfile, _course: Course) {
    return 0;
  }

  function toggleStage(
    userId: string,
    stage: "profile" | "plan" | "module",
    moduleId?: string
  ) {
    setSelection((prev) => {
      const existing =
        prev[userId] ?? {
          profile: false,
          plan: false,
          modules: {}
        };
      const nextModules = { ...existing.modules };
      if (stage === "module" && moduleId) {
        nextModules[moduleId] = !nextModules[moduleId];
      }
      const next = {
        profile: stage === "profile" ? !existing.profile : existing.profile,
        plan: stage === "plan" ? !existing.plan : existing.plan,
        modules: nextModules
      };
      return {
        ...prev,
        [userId]: next
      };
    });
  }

  function assignTasksForMember(userId: string) {
    const stages = selection[userId];
    if (!stages) {
      return;
    }

    const member = props.teamMembers.find((m) => m.id === userId);
    if (!member) {
      return;
    }

    const newTasks: AssignedTask[] = [];

    if (stages.profile) {
      newTasks.push({
        id: `task-${member.id}-profile-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        userId: member.id,
        label: "Complete profile & upload headshot",
        status: "open"
      });
    }

    if (stages.plan) {
      newTasks.push({
        id: `task-${member.id}-plan-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        userId: member.id,
        label: "Commit business plan",
        status: "open"
      });
    }

    Object.entries(stages.modules).forEach(([moduleId, checked]) => {
      if (!checked) {
        return;
      }
      const course = props.courses.find((c) => c.id === moduleId);
      const courseTitle = course ? course.title : "Training module";
      newTasks.push({
        id: `task-${member.id}-${moduleId}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        userId: member.id,
        label: `Catch up on ${courseTitle}`,
        status: "open"
      });
    });

    if (newTasks.length === 0) {
      return;
    }

    setTasks((prev) => [...prev, ...newTasks]);
    setSelection((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }

  function markTaskCompleted(taskId: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, status: "completed" } : task
      )
    );
  }

  const totalAssigned = tasks.length;
  const completedCount = tasks.filter((task) => task.status === "completed")
    .length;
  const outstandingCount = totalAssigned - completedCount;

  return (
    <div>
      <div className="grid grid-3">
        <DashboardCard
          title="Total Tasks Assigned"
          value={totalAssigned.toString()}
        />
        <DashboardCard
          title="Total Tasks Completed"
          value={completedCount.toString()}
        />
        <DashboardCard
          title="Outstanding Tasks"
          value={outstandingCount.toString()}
        />
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Task Tracker</span>
          </div>
        </div>
        <div className="panel-body">
          {props.teamMembers.length === 0 ? (
            <div className="panel-empty">
              No team members yet. Add sales reps to track tasks.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `minmax(0, 180px) repeat(${
                    3 + props.courses.length
                  }, minmax(0, 140px))`,
                  columnGap: 8,
                  rowGap: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 8,
                  padding: "4px 0",
                  borderBottom: "1px solid #e5e7eb",
                  color: "#6b7280"
                }}
              >
                <div>Rep</div>
                <div>Profile</div>
                <div>Business Plan</div>
                {props.courses.map((course) => (
                  <div key={course.id}>{course.title}</div>
                ))}
                <div style={{ textAlign: "right" }}>Actions</div>
              </div>
              {props.teamMembers.map((member, rowIndex) => {
                const profilePct = getProfileCompletion(member);
                const planPct = getBusinessPlanCompletion(member);
                const selectionForMember = selection[member.id];
                const hasModuleSelection = selectionForMember
                  ? Object.values(selectionForMember.modules).some(Boolean)
                  : false;
                const hasAnySelection =
                  !!selectionForMember?.profile ||
                  !!selectionForMember?.plan ||
                  hasModuleSelection;
                return (
                  <div
                    key={member.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: `minmax(0, 180px) repeat(${
                        3 + props.courses.length
                      }, minmax(0, 140px))`,
                      columnGap: 8,
                      rowGap: 4,
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
                        {member.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        {member.role.toUpperCase()} •{" "}
                        {member.territory ?? "No territory"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12 }}>
                        {profilePct}% complete
                      </div>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 4,
                          fontSize: 11
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selection[member.id]?.profile ?? false}
                          onChange={() =>
                            toggleStage(member.id, "profile")
                          }
                        />
                        <span>Assign follow-up</span>
                      </label>
                    </div>
                    <div>
                      <div style={{ fontSize: 12 }}>
                        {planPct}% complete
                      </div>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 4,
                          fontSize: 11
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selection[member.id]?.plan ?? false}
                          onChange={() => toggleStage(member.id, "plan")}
                        />
                        <span>Assign follow-up</span>
                      </label>
                    </div>
                    {props.courses.map((course) => {
                      const completionPct = getModuleCompletion(
                        member,
                        course
                      );
                      const isChecked =
                        selection[member.id]?.modules?.[course.id] ?? false;
                      return (
                        <div key={course.id}>
                          <div style={{ fontSize: 12 }}>
                            {completionPct}% complete
                          </div>
                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              marginTop: 4,
                              fontSize: 11
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() =>
                                toggleStage(member.id, "module", course.id)
                              }
                            />
                            <span>Assign task</span>
                          </label>
                        </div>
                      );
                    })}
                    <div style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn-primary btn-success btn-small"
                        disabled={!hasAnySelection}
                        onClick={() => assignTasksForMember(member.id)}
                      >
                        Assign
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
      {tasks.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <div className="panel-header-row">
              <span>Assigned Tasks</span>
            </div>
          </div>
          <div className="panel-body">
            <div className="list">
              {tasks.map((task) => {
                const member = props.teamMembers.find(
                  (m) => m.id === task.userId
                );
                return (
                  <div key={task.id} className="list-item">
                    <div className="list-item-title">{task.label}</div>
                    <div className="list-item-subtitle">
                      {member ? member.name : "Unknown rep"}
                    </div>
                    <div className="list-item-actions">
                      {task.status === "open" ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => markTaskCompleted(task.id)}
                        >
                          Mark completed
                        </button>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#16a34a",
                            fontWeight: 500
                          }}
                        >
                          Completed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Placeholder(props: { title: string; description: string }) {
  return (
    <div className="placeholder">
      <div className="placeholder-title">{props.title}</div>
      <div className="placeholder-description">{props.description}</div>
    </div>
  );
}

function ManagerOnlineTrainingPage(props: {
  currentUser: AuthenticatedUser;
  courses: Course[];
}) {
  const publishedCourses = props.courses.filter(
    (course) => course.status !== "draft"
  );

  function getManagerCourseCompletion(course: Course) {
    const userCode =
      (props.currentUser.id.charCodeAt(0) || 0) +
      (props.currentUser.name.charCodeAt(0) || 0);
    const courseCode = course.id.charCodeAt(0) || 0;
    const raw = (userCode * 5 + courseCode * 11) % 101;
    return raw;
  }

  const managerCoursePercentages = publishedCourses.map((course) =>
    getManagerCourseCompletion(course)
  );

  const managerAverageCompletion =
    managerCoursePercentages.length > 0
      ? Math.round(
          managerCoursePercentages.reduce((sum, value) => sum + value, 0) /
            managerCoursePercentages.length
        )
      : 0;

  return (
    <div className="training-center">
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <DashboardCard
          title="Your Online Course Completion"
          value={`${managerAverageCompletion}%`}
          description="Across all published courses"
        />
        <DashboardCard
          title="Available Courses"
          value={publishedCourses.length.toString()}
          description="Published online trainings"
        />
      </div>
      {publishedCourses.length === 0 ? (
        <div className="panel" style={{ marginTop: 0 }}>
          <div className="panel-body">
            <div className="panel-empty">
              No published trainings yet. Publish courses to track progress.
            </div>
          </div>
        </div>
      ) : (
        <div className="training-card-grid">
          {publishedCourses.map((course, index) => {
            const pct = managerCoursePercentages[index] ?? 0;
            return (
              <div key={course.id} className="training-card">
                <div className="training-card-image">
                  <div className="training-card-image-overlay">
                    {course.tagline && (
                      <span className="training-card-chip">
                        {course.tagline}
                      </span>
                    )}
                  </div>
                </div>
                <div className="training-card-body">
                  <div className="training-card-title">{course.title}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ManagerPortal(props: ManagerPortalProps) {
  const [activeView, setActiveView] = useState<ManagerViewId>("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  function renderView() {
    if (activeView === "dashboard") {
      return <ManagerDashboard teamMembers={props.teamMembers} />;
    }
    if (activeView === "team") {
      return (
        <TeamPage
          teamMembers={props.teamMembers}
          onTeamMembersChange={props.onTeamMembersChange}
        />
      );
    }
    if (activeView === "plans") {
      return (
        <TeamBusinessPlansPage
          teamMembers={props.teamMembers}
          onTeamMembersChange={props.onTeamMembersChange}
        />
      );
    }
    if (activeView === "training") {
      return (
        <TeamTrainingProgressPage
          currentUser={props.currentUser}
          teamMembers={props.teamMembers}
          courses={props.courses}
        />
      );
    }
    if (activeView === "onlineTraining") {
      return (
        <ManagerOnlineTrainingPage
          currentUser={props.currentUser}
          courses={props.courses}
        />
      );
    }
    if (activeView === "taskTracker") {
      return (
        <TaskTracker
          teamMembers={props.teamMembers}
          courses={props.courses}
        />
      );
    }
    if (activeView === "loom") {
      return (
        <Placeholder
          title="Loom Library"
          description="Central place for Loom call reviews, trainings, and walkthroughs."
        />
      );
    }
    if (activeView === "trainingMaterials") {
      return (
        <Placeholder
          title="Training Materials"
          description="Decks, one-pagers, and resources managers share with their team."
        />
      );
    }
    if (activeView === "assistant") {
      return (
        <Placeholder
          title="AI Assistant"
          description="Coach-style assistant for pipeline reviews and one-on-ones."
        />
      );
    }
    return null;
  }

  return (
    <Layout
      isSidebarCollapsed={isSidebarCollapsed}
      sidebar={
        <Sidebar
          header={<div className="sidebar-title">Manager Portal</div>}
          items={sidebarItems}
          activeId={activeView}
          onSelect={(id) => setActiveView(id as ManagerViewId)}
          onLogout={props.onLogout}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />
      }
      header={
        <Header
          title="Sales & Marketing Operating System"
          subtitle="Manager view"
          userName={props.currentUser.name}
          roleLabel="Manager"
          onLogout={props.onLogout}
        />
      }
    >
      {renderView()}
    </Layout>
  );
}
