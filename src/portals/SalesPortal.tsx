import { useMemo, useState, useEffect, useRef, ChangeEvent } from "react";
import Image from "next/image";
import { Layout } from "../components/Layout";
import { Sidebar } from "../components/Sidebar";
import { Header } from "../components/Header";
import { DashboardCard } from "../components/DashboardCard";
import {
  AuthenticatedUser,
  UserProfile,
  ModuleKey,
  BusinessPlan,
  Course
} from "../types";
import headerLogo from "../../ref. images/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png";
import footerImage from "../../ref. images/image.png";

type SalesPortalProps = {
  currentUser: AuthenticatedUser;
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
  onLogout: () => void;
  courses: Course[];
};

type SalesViewId =
  | "dashboard"
  | "profile"
  | "plan"
  | "training"
  | "materials"
  | "aiChat"
  | "webPage"
  | "businessCards";

const sidebarItems: { id: SalesViewId; label: string }[] = [
  { id: "dashboard", label: "My Dashboard" },
  { id: "profile", label: "My Profile" },
  { id: "plan", label: "My Business Plan" },
  { id: "training", label: "Training Center" },
  { id: "materials", label: "Marketing Materials" },
  { id: "aiChat", label: "Jay Miller's Clone" },
  { id: "webPage", label: "My Web Page" },
  { id: "businessCards", label: "Tools/ Apps" }
];

const viewToModuleKey: Partial<Record<SalesViewId, ModuleKey>> = {
  plan: "businessPlan",
  training: "trainingCenter",
  materials: "marketingMaterials",
  aiChat: "aiChat",
  webPage: "repWebPage",
  businessCards: "businessCards"
};

function SalesDashboard(props: { profile: UserProfile }) {
  const plan = props.profile.businessPlan;
  const incomeGoal = plan?.revenueGoal ?? 0;
  const dealsNeeded = plan?.dealsPerYear ?? 0;
  const claimsNeeded = Math.ceil(dealsNeeded * 1.2);
  const inspectionsNeeded = plan?.inspectionsNeeded ?? 0;
  const convosNeeded = Math.ceil(inspectionsNeeded * 2.5);
  const doorsNeeded = plan?.doorsPerYear ?? 0;
  const locationFromPlan =
    plan && plan.territories.length > 0 ? plan.territories[0] : undefined;
  const location = props.profile.territory ?? locationFromPlan ?? "";

  const incomeActual = 84000;
  const dealsActual = 6;
  const claimsActual = 8;
  const inspectionsActual = 32;
  const convosActual = 85;
  const doorsActual = 420;

  const incomeDelta = incomeActual - incomeGoal;
  const dealsDelta = dealsActual - dealsNeeded;
  const claimsDelta = claimsActual - claimsNeeded;
  const inspectionsDelta = inspectionsActual - inspectionsNeeded;
  const convosDelta = convosActual - convosNeeded;
  const doorsDelta = doorsActual - doorsNeeded;

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
    },
    {
      id: "convos",
      label: "Convos",
      goal: convosNeeded,
      actual: convosActual,
      format: (value: number) => value.toLocaleString()
    },
    {
      id: "doors",
      label: "Doors",
      goal: doorsNeeded,
      actual: doorsActual,
      format: (value: number) => value.toLocaleString()
    }
  ];

  const maxComparisonValue = Math.max(
    ...comparisonItems.map((item) => Math.max(item.goal, item.actual))
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
      <div className="sales-plan-heading">
        <div className="sales-plan-summary-main">
          <div className="sales-plan-summary-name">Goals Committed to</div>
        </div>
      </div>
      <div className="grid grid-4">
        <DashboardCard
          title="Income Goal"
          value={`$${incomeGoal.toLocaleString()}`}
        />
        <DashboardCard
          title="Deals Needed"
          value={dealsNeeded.toLocaleString()}
        />
        <DashboardCard
          title="Claims Needed"
          value={claimsNeeded.toLocaleString()}
        />
        <DashboardCard
          title="Inspections Needed"
          value={inspectionsNeeded.toLocaleString()}
        />
        <DashboardCard
          title="Convos Needed"
          value={convosNeeded.toLocaleString()}
        />
        <DashboardCard
          title="Doors Needed"
          value={doorsNeeded.toLocaleString()}
        />
      </div>
      <div className="sales-plan-heading">
        <div className="sales-plan-summary-main">
          <div className="sales-plan-summary-name">Actuals</div>
        </div>
      </div>
      <div className="grid grid-4">
        <DashboardCard
          title="Income Actual"
          value={`$${incomeActual.toLocaleString()}`}
        />
        <DashboardCard title="Deals Actual" value={String(dealsActual)} />
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
          <div className="sales-plan-summary-name">Delta</div>
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
      <div className="sales-chart-card">
        <div className="sales-chart-header">Monthly Reports & Analysis</div>
        <div className="sales-chart-body">
          {comparisonItems.map((item) => {
            const goalWidth =
              maxComparisonValue > 0
                ? (item.goal / maxComparisonValue) * 100
                : 0;
            const actualWidth =
              maxComparisonValue > 0
                ? (item.actual / maxComparisonValue) * 100
                : 0;

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
                      style={{ width: `${goalWidth}%` }}
                    />
                    <div
                      className="sales-chart-runner"
                      style={{ left: `${actualWidth}%` }}
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

function ProfilePage(props: {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
}) {
  const profile = props.profile;
  const initials =
    profile.name && profile.name.trim().length > 0
      ? profile.name.trim().charAt(0).toUpperCase()
      : "J";

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const territoryRef = useRef<HTMLDivElement | null>(null);
  const [isTerritoryOpen, setIsTerritoryOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const saveNoticeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function update(next: Partial<UserProfile>) {
    props.onProfileChange({ ...profile, ...next });
  }

  function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    update({ headshotUrl: objectUrl });
  }

  const territoryOptions = [
    "DFW, Texas",
    "Lubbock, Texas",
    "Round Rock, Texas",
    "Other"
  ];

  const selectedTerritories =
    profile.territory && profile.territory.length > 0
      ? profile.territory
          .split("·")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!territoryRef.current) {
        return;
      }
      if (!territoryRef.current.contains(event.target as Node)) {
        setIsTerritoryOpen(false);
      }
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsTerritoryOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeydown);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="profile-header-row">
          <div>
            <div className="profile-title">Profile</div>
            <div className="profile-subtitle">Your profile information</div>
          </div>
        </div>
        <div className="profile-photo-row">
          <div className="profile-photo-wrapper">
            {profile.headshotUrl ? (
              <img
                src={profile.headshotUrl}
                alt={profile.name}
                className="profile-photo-image"
              />
            ) : (
              <div className="profile-photo-initials">{initials}</div>
            )}
          </div>
          <div className="profile-photo-text">
            <div className="profile-photo-title">Profile Photo</div>
            <button
              type="button"
              className="profile-photo-upload"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
            >
              Click to upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handlePhotoSelected}
            />
            <div className="profile-photo-hint">JPG, PNG · Max 100MB</div>
          </div>
        </div>
        <div className="profile-body-grid">
          <label className="field">
            <span className="field-label">Full Name</span>
            <input
              className="field-input"
              value={profile.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Your name"
            />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="field-input field-input-disabled"
              value={profile.email}
              disabled
            />
            <span className="field-help">Email cannot be changed</span>
          </label>
          <label className="field">
            <span className="field-label">Phone</span>
            <input
              className="field-input"
              value={profile.phone ?? ""}
              onChange={(e) => update({ phone: e.target.value })}
              placeholder="Your mobile number"
            />
          </label>
          <div
            className="field territory-field"
            ref={territoryRef}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget as Node | null;
              if (nextTarget && territoryRef.current?.contains(nextTarget)) {
                return;
              }
              setIsTerritoryOpen(false);
            }}
          >
            <span className="field-label">Territory</span>
            <button
              type="button"
              className={
                isTerritoryOpen
                  ? "field-input territory-trigger territory-trigger-open"
                  : "field-input territory-trigger"
              }
              aria-haspopup="listbox"
              aria-expanded={isTerritoryOpen}
              onClick={() => setIsTerritoryOpen((prev) => !prev)}
            >
              <span
                className={
                  selectedTerritories.length > 0
                    ? "territory-trigger-value"
                    : "territory-trigger-placeholder"
                }
              >
                {selectedTerritories.length > 0
                  ? selectedTerritories.join(", ")
                  : "Select territories"}
              </span>
              <span className="territory-trigger-icon">▾</span>
            </button>
            {isTerritoryOpen && (
              <div
                className="territory-dropdown"
                role="listbox"
                aria-multiselectable="true"
              >
                {territoryOptions.map((option) => {
                  const checked = selectedTerritories.includes(option);
                  return (
                    <label
                      key={option}
                      className={
                        checked
                          ? "territory-option territory-option-active"
                          : "territory-option"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...selectedTerritories, option]
                            : selectedTerritories.filter(
                                (item) => item !== option
                              );
                          update({ territory: next.join(" · ") });
                        }}
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="form-grid plan-form-grid">
        <label className="field">
          <span className="field-label">Strengths / Superpowers</span>
          <textarea
            className="field-input"
            rows={4}
            value={profile.strengths}
            onChange={(e) => update({ strengths: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">Weaknesses / Insecurities</span>
          <textarea
            className="field-input"
            rows={4}
            value={profile.weaknesses}
            onChange={(e) => update({ weaknesses: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">Web Page Bio</span>
          <textarea
            className="field-input"
            rows={4}
            value={profile.bio ?? ""}
            onChange={(e) => update({ bio: e.target.value })}
            placeholder="Short personal bio that appears on your public page"
          />
        </label>
      </div>
      <div className="panel-section">
        <div className="panel-section-title">Public Web Page Fields</div>
        <div className="toggle-grid">
          <label className="toggle-item">
            <input
              type="checkbox"
              checked={profile.publicProfile.showHeadshot}
              onChange={(e) =>
                update({
                  publicProfile: {
                    ...profile.publicProfile,
                    showHeadshot: e.target.checked
                  } as UserProfile["publicProfile"]
                })
              }
            />
            <span className="toggle-label">Show headshot</span>
          </label>
          <label className="toggle-item">
            <input
              type="checkbox"
              checked={profile.publicProfile.showEmail}
              onChange={(e) =>
                update({
                  publicProfile: {
                    ...profile.publicProfile,
                    showEmail: e.target.checked
                  } as UserProfile["publicProfile"]
                })
              }
            />
            <span className="toggle-label">Show email</span>
          </label>
          <label className="toggle-item">
            <input
              type="checkbox"
              checked={profile.publicProfile.showPhone}
              onChange={(e) =>
                update({
                  publicProfile: {
                    ...profile.publicProfile,
                    showPhone: e.target.checked
                  } as UserProfile["publicProfile"]
                })
              }
            />
            <span className="toggle-label">Show phone</span>
          </label>
        </div>
      </div>
      <div className="profile-save-row">
        <button
          type="button"
          className="btn-secondary btn-dark"
          onClick={() => {
            window.open(`https://www.millerstorm.com/team/${profile.name.toLowerCase().replace(/\s+/g, "")}`, "_blank");
          }}
        >
          Preview
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setSaveNotice("Saved");
            if (saveNoticeTimeout.current) {
              clearTimeout(saveNoticeTimeout.current);
            }
            saveNoticeTimeout.current = setTimeout(() => {
              setSaveNotice("");
            }, 2000);
          }}
          style={{ marginLeft: 8 }}
        >
          Save
        </button>
        <button
          type="button"
          className="btn-primary btn-success"
          onClick={() => {
            props.onProfileChange({
              ...profile,
              webPage: {
                ...(profile.webPage ?? {}),
                status: "published"
              }
            });
            setSaveNotice("✓ Published successfully!");
            if (saveNoticeTimeout.current) {
              clearTimeout(saveNoticeTimeout.current);
            }
            saveNoticeTimeout.current = setTimeout(() => {
              setSaveNotice("");
            }, 2000);
          }}
          style={{ marginLeft: 8 }}
        >
          Save & Publish
        </button>
        {saveNotice && (
          <span style={{ fontSize: 12, color: "#16a34a", marginLeft: 8 }}>
            {saveNotice}
          </span>
        )}
      </div>
    </div>
  );
}

function BusinessPlanPage(props: {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
}) {
  const existingPlan = props.profile.businessPlan;
  const revenueOptions = Array.from(
    { length: 19 },
    (_, index) => 100000 + index * 50000
  );
  const [revenueGoal, setRevenueGoal] = useState(
    existingPlan?.revenueGoal ?? 100000
  );
  const [territoryInput] = useState(
    existingPlan?.territories.join(", ") ??
      props.profile.territory ??
      ""
  );
  const [daysPerWeek, setDaysPerWeek] = useState(
    existingPlan?.daysPerWeek ?? 5
  );
  const [committed, setCommitted] = useState(existingPlan?.committed ?? false);

  const metrics = useMemo(() => {
    const averageDealSize = existingPlan?.averageDealSize ?? 12000;
    const inspectionToDealRate = 0.4;
    const doorsToInspectionRate = 0.08;

    const dealsPerYear = Math.ceil(revenueGoal / averageDealSize);
    const dealsPerMonth = Math.ceil(dealsPerYear / 12);
    const inspectionsNeeded = Math.ceil(dealsPerYear / inspectionToDealRate);
    const doorsPerYear = Math.ceil(inspectionsNeeded / doorsToInspectionRate);
    const inspectionsPerMonth = Math.ceil(inspectionsNeeded / 12);
    const doorsPerMonth = Math.ceil(doorsPerYear / 12);
    const weeksPerYear = 52;
    const doorsPerDay =
      daysPerWeek > 0
        ? Math.ceil(doorsPerYear / (weeksPerYear * daysPerWeek))
        : 0;

    return {
      dealsPerYear,
      dealsPerMonth,
      inspectionsNeeded,
      doorsPerYear,
      inspectionsPerMonth,
      doorsPerMonth,
      doorsPerDay
    };
  }, [existingPlan?.averageDealSize, revenueGoal, daysPerWeek]);

  useEffect(() => {
    const territories = territoryInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const plan: BusinessPlan = {
      revenueGoal,
      daysPerWeek,
      territories,
      averageDealSize: existingPlan?.averageDealSize ?? 12000,
      dealsPerYear: metrics.dealsPerYear,
      dealsPerMonth: metrics.dealsPerMonth,
      inspectionsNeeded: metrics.inspectionsNeeded,
      doorsPerYear: metrics.doorsPerYear,
      doorsPerDay: metrics.doorsPerDay,
      committed
    };

    props.onProfileChange({
      ...props.profile,
      businessPlan: plan
    });
  }, [
    revenueGoal,
    daysPerWeek,
    territoryInput,
    metrics.dealsPerYear,
    metrics.dealsPerMonth,
    metrics.inspectionsNeeded,
    metrics.doorsPerYear,
    metrics.doorsPerDay,
    committed,
    props
  ]);

  return (
    <div className="business-plan">
      <div className="panel-header">My Business Plan</div>
      <div className="plan-form-row">
        <label className="field plan-field-revenue">
          <span className="field-label">Revenue Goal</span>
          <select
            className="field-input"
            value={revenueGoal.toString()}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setRevenueGoal(Number(e.target.value) || 0)
            }
          >
            {revenueOptions.map((amount) => (
              <option key={amount} value={amount.toString()}>
                ${amount.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <label className="field plan-field-days">
          <span className="field-label">Days per week working</span>
          <div className="plan-days-row">
            <input
              className="field-input"
              type="number"
              min={1}
              max={7}
              value={daysPerWeek}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setDaysPerWeek(Number(e.target.value) || 0)
              }
            />
            <button
              type="button"
              className="btn-primary plan-calculate-button"
            >
              Calculate
            </button>
          </div>
        </label>
      </div>
      <div className="grid grid-3 plan-metrics">
        <DashboardCard
          title="Deals Needed Per Year"
          value={String(metrics.dealsPerYear)}
        />
        <DashboardCard
          title="Deals Needed Per Month"
          value={String(metrics.dealsPerMonth)}
        />
        <DashboardCard
          title="Inspections Needed Per Month"
          value={String(metrics.inspectionsPerMonth)}
        />
        <DashboardCard
          title="Doors Knocked Per month"
          value={String(metrics.doorsPerMonth)}
        />
        <DashboardCard
          title="Doors To Knock Per Day"
          value={String(metrics.doorsPerDay)}
        />
      </div>
      <div className="panel-section plan-actions">
        <button
          className={committed ? "btn-primary solid" : "btn-primary"}
          onClick={() => setCommitted(true)}
        >
          I’m Committed To My Plan – send to manager for approval
        </button>
        {committed && (
          <span className="plan-commitment-badge">
            Commitment recorded for this plan
          </span>
        )}
      </div>
    </div>
  );
}

function TrainingCenter(props: { courses: Course[] }) {
  const courses = props.courses.filter((course) => course.status !== "draft");
  const [search, setSearch] = useState("");

  const filteredCourses = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) {
      return courses;
    }
    return courses.filter((course: Course) => {
      const inTitle = course.title.toLowerCase().includes(term);
      const inLessons = course.lessonNames.some((name) =>
        name.toLowerCase().includes(term)
      );
      const inAssets = course.assetFiles.some((file) =>
        file.toLowerCase().includes(term)
      );
      return inTitle || inLessons || inAssets;
    });
  }, [courses, search]);

  return (
    <div className="training-center">
      <div className="training-center-header">
        <div className="panel-header">Training Center</div>
        <div className="training-center-search">
          <input
            className="field-input"
            placeholder="Search trainings"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {filteredCourses.length > 0 ? (
        <div className="training-card-grid">
          {filteredCourses.map((course: Course) => (
            <div key={course.id} className="training-card">
              <div className="training-card-image">
                <div className="training-card-image-overlay">
                  {course.tagline && (
                    <span className="training-card-chip">{course.tagline}</span>
                  )}
                </div>
              </div>
              <div className="training-card-body">
                <div className="training-card-title">{course.title}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel-empty">No trainings match your search yet.</div>
      )}
    </div>
  );
}

type AiMessage = {
  id: number;
  role: "user" | "ai";
  text: string;
};

function AiChatPanel() {
  const [model, setModel] = useState("Gemini 3 Flash");
  const [profileOption, setProfileOption] = useState("None");
  const [offerOption, setOfferOption] = useState("None");
  const [modeOption, setModeOption] = useState("Just Chat");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [nextId, setNextId] = useState(1);

  function pushMessage(role: AiMessage["role"], text: string) {
    setMessages((prev) => [...prev, { id: nextId, role, text }]);
    setNextId((id) => id + 1);
  }

  function handleSend() {
    const text = input.trim();
    if (!text) {
      return;
    }
    pushMessage("user", text);
    setInput("");
    const summaryPieces = [
      `Model: ${model}`,
      profileOption !== "None" ? `Profile: ${profileOption}` : null,
      offerOption !== "None" ? `Offer: ${offerOption}` : null,
      `Mode: ${modeOption}`
    ].filter(Boolean);
    const summary =
      summaryPieces.length > 0 ? ` (${summaryPieces.join(" • ")})` : "";
    pushMessage(
      "ai",
      `Placeholder response for now. Backend wiring can plug in a real AI later.${summary}`
    );
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="ai-clone-page">
      <div className="ai-clone-shell">
        <div className="ai-clone-icon">💬</div>
        <div className="ai-clone-title">How can I help you today?</div>
        <div className="ai-clone-subtitle">
          Your intelligent co-pilot for strategy, content, and growth. Ask
          anything or use a tool to get started.
        </div>
        <div className="ai-clone-card">
          <div className="ai-clone-messages chat-messages">
            {messages.length === 0 ? (
              <div className="ai-clone-empty">
                Start typing below to chat with your assistant.
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "chat-message chat-message-user"
                      : "chat-message chat-message-ai"
                  }
                >
                  <div className="chat-message-label">
                    {message.role === "user" ? "You" : "AI"}
                  </div>
                  <div className="chat-message-text">{message.text}</div>
                </div>
              ))
            )}
          </div>
          <textarea
            className="ai-clone-input"
            placeholder="Message AI... (Shift+Enter for new line)"
            value={input}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              setInput(event.target.value)
            }
            onKeyDown={handleKeyDown}
          />
          <div className="ai-clone-toolbar">
            <div className="ai-clone-toolbar-left">
              <select
                className="ai-clone-select"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              >
                <option>Gemini 3 Flash</option>
                <option>Claude 4.5 Sonnet</option>
                <option>GPT-5.2</option>
              </select>
              <select
                className="ai-clone-select"
                value={profileOption}
                onChange={(event) => setProfileOption(event.target.value)}
              >
                <option value="None">Profile</option>
                <option value="Create profile">Create profile</option>
              </select>
              <select
                className="ai-clone-select"
                value={offerOption}
                onChange={(event) => setOfferOption(event.target.value)}
              >
                <option value="None">Offer</option>
                <option value="Solar">Solar</option>
                <option value="Roofing">Roofing</option>
                <option value="HVAC">HVAC</option>
              </select>
              <select
                className="ai-clone-select"
                value={modeOption}
                onChange={(event) => setModeOption(event.target.value)}
              >
                <option>Just Chat</option>
                <option>Prospecting</option>
                <option>Objection Handling</option>
                <option>Sales Scripting</option>
              </select>
            </div>
            <div className="ai-clone-toolbar-right">
              <button
                type="button"
                className="ai-clone-icon-button"
                title="Attach"
              >
                📎
              </button>
              <button
                type="button"
                className="ai-clone-send-button"
                onClick={handleSend}
              >
                ➤
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Material = {
  id: string;
  name: string;
  category: string;
  status: "Pending" | "Approved" | "Rejected";
};

const materials: Material[] = [
  {
    id: "door-flyer",
    name: "Door Hanger Flyer",
    category: "Print",
    status: "Approved"
  },
  {
    id: "neighborhood-mailer",
    name: "Neighborhood Mailer",
    category: "Direct Mail",
    status: "Pending"
  },
  {
    id: "social-carousel",
    name: "Social Carousel Post",
    category: "Social",
    status: "Approved"
  }
];

function MarketingMaterials() {
  const [category, setCategory] = useState("All");

  const filtered = materials.filter((m) =>
    category === "All" ? true : m.category === category
  );

  return (
    <div className="materials-page">
      <div className="panel-header">Marketing Materials</div>
      <div className="field">
        <span className="field-label">Filter by category</span>
        <select
          className="field-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option>All</option>
          <option>Print</option>
          <option>Direct Mail</option>
          <option>Social</option>
        </select>
      </div>
      <div className="materials-grid">
        {filtered.map((material) => (
          <div key={material.id} className="card material-card">
            <div className="card-title">{material.name}</div>
            <div className="card-description">{material.category}</div>
            <div className={`status-badge status-${material.status.toLowerCase()}`}>
              {material.status}
            </div>
            <div className="card-actions">
              <button className="btn-secondary">Download</button>
              <button className="btn-ghost">Request Print</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WebPagePreview(props: {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
}) {
  const profile = props.profile;
  const slug = profile.name
    .toLowerCase()
    .replace(/\s+/g, "");
  const url = `https://www.millerstorm.com/team/${slug}`;
  const shortUrl = `https://ms.millerstorm.com/${slug}`;

  const missionTitle = profile.missionTitle || profile.name || "MY BIO";
  const missionBody = profile.missionBody ?? profile.bio ?? "";
  const marketingMaterialsNotes = profile.marketingMaterialsNotes ?? "";
  const missionCtaLabel = profile.missionCtaLabel || "MAKE AN APPOINTMENT";
  function pickImageUrl(...urls: (string | undefined)[]) {
    for (const u of urls) {
      const url = (u ?? "").trim();
      if (!url) continue;
      if (/^(https?:\/\/|blob:|data:image)/.test(url)) {
        return url;
      }
    }
    return "";
  }
  const missionImageUrl = pickImageUrl(profile.headshotUrl, profile.missionImageUrl);
  const whyUsTitle = profile.whyUsTitle || "HERE’S WHY YOU NEED US";
  const whyUsBody =
    profile.whyUsBody || marketingMaterialsNotes || "";
  const expertRoofersTitle =
    profile.expertRoofersTitle || "EXPERT ROOFERS AT YOUR SERVICE";
  const expertRoofersBody = profile.expertRoofersBody || "";
  const splitParagraphs = (value: string) =>
    value
      .split(/\n\s*\n/g)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
  const missionParagraphs = splitParagraphs(missionBody);
  const whyUsParagraphs = splitParagraphs(whyUsBody);
  const expertRoofersParagraphs = splitParagraphs(expertRoofersBody);
  const showEmail = profile.publicProfile?.showEmail ?? false;
  const showPhone = profile.publicProfile?.showPhone ?? false;
  const contactEmail = showEmail ? profile.email : "";
  const contactPhone = showPhone ? (profile.phone ?? "") : "";

  function submitForApproval() {
    if (profile.webPage?.status === "published") {
      alert("Web page is already published.");
      return;
    }
    props.onProfileChange({
      ...profile,
      webPage: {
        ...(profile.webPage ?? {}),
        status: "published"
      }
    });
    alert("✓ Web page published successfully!");
  }

  function openPreview() {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="web-preview">
      <div className="panel-header">Sales Rep Web Page Preview</div>
      <div className="web-preview-actions">
        <button
          type="button"
          className="btn-secondary btn-dark btn-small"
          onClick={openPreview}
        >
          Preview
        </button>
        <button
          type="button"
          className="btn-primary btn-small"
          onClick={() => {
            alert("Changes saved (placeholder).");
          }}
        >
          Save
        </button>
        <button
          type="button"
          className="btn-primary btn-success btn-small"
          onClick={submitForApproval}
        >
          Save & Publish
        </button>
      </div>
      <div className="web-preview-url">{url}</div>
      <div className="web-preview-url web-preview-url-secondary">
        Short link: {shortUrl}
      </div>
      <div className="ms-header-preview">
        <div className="ms-header-top">
          <div className="ms-header-top-text">
            24/7 Emergency Service Available: Call or Text (817) 367-0843
          </div>
        </div>
        <div className="ms-header-main">
          <div className="ms-header-logo-centered">
            <Image
              src={headerLogo}
              alt="Miller Storm header logo"
              width={220}
              height={90}
              className="ms-header-logo-image"
            />
          </div>
        </div>
      </div>
      <div className="ms-mission">
        <div className="ms-mission-card">
          <div className="ms-mission-text">
            <div className="ms-mission-title">{missionTitle}</div>
            <div className="ms-mission-body">
              {missionParagraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
          <div className="ms-mission-image">
            {missionImageUrl ? (
              <img
                src={missionImageUrl}
                alt="Miller Storm team"
                className="ms-mission-image-img"
              />
            ) : (
              <div className="ms-mission-image-placeholder">
                Mission image placeholder
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="ms-copy">
        {whyUsBody.trim() && (
          <div className="ms-copy-section">
            <div className="ms-copy-title">{whyUsTitle}</div>
            <div className="ms-copy-body">
              {whyUsParagraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
        )}
        {expertRoofersBody.trim() && (
          <div className="ms-copy-section">
            <div className="ms-copy-title">{expertRoofersTitle}</div>
            <div className="ms-copy-body">
              {expertRoofersParagraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="ms-testimonials">
        <div className="ms-testimonials-grid">
          <div className="ms-testimonial-card">
            <div className="ms-testimonial-stars">★★★★★</div>
            <div className="ms-testimonial-body">
              Seth and team were fantastic to work with!
            </div>
            <div className="ms-testimonial-footer">
              <div className="ms-testimonial-name">Lori M.</div>
              <div className="ms-testimonial-source">Google Reviews</div>
            </div>
          </div>
          <div className="ms-testimonial-card">
            <div className="ms-testimonial-stars">★★★★★</div>
            <div className="ms-testimonial-body">
              When we had hail damage in October of ’23, as first time
              homebuyers, we didn’t know how to proceed with our roof
              replacement. We were bombarded with knocks on our door...
            </div>
            <div className="ms-testimonial-footer">
              <div className="ms-testimonial-name">Clayton G.</div>
              <div className="ms-testimonial-source">facebook</div>
            </div>
          </div>
          <div className="ms-testimonial-card">
            <div className="ms-testimonial-stars">★★★★★</div>
            <div className="ms-testimonial-body">
              This company is GREAT. Phil was my contact, he did an excellent
              job. I had one conversation with my insurance company and he did
              the rest. Phil checked with me throughout the...
            </div>
            <div className="ms-testimonial-footer">
              <div className="ms-testimonial-name">Gary G.</div>
              <div className="ms-testimonial-source">Google Reviews</div>
            </div>
          </div>
        </div>
      </div>
      <div className="ms-review-strip">
        <div className="ms-review-strip-grid">
          <div className="ms-review-strip-item">
            <div className="ms-review-strip-stars">★★★★★</div>
            <div className="ms-review-strip-text">100% Recommended</div>
            <div className="ms-review-strip-brand">facebook reviews</div>
          </div>
          <div className="ms-review-strip-item">
            <div className="ms-review-strip-stars">★★★★★</div>
            <div className="ms-review-strip-text">5/5 Perfect Rating</div>
            <div className="ms-review-strip-brand">BBB Accredited Business</div>
          </div>
          <div className="ms-review-strip-item">
            <div className="ms-review-strip-stars">★★★★★</div>
            <div className="ms-review-strip-text">Over 200 Reviews</div>
            <div className="ms-review-strip-brand">Google Reviews</div>
          </div>
          <div className="ms-review-strip-item">
            <div className="ms-review-strip-stars">★★★★★</div>
            <div className="ms-review-strip-text">5.0 Star Rating</div>
            <div className="ms-review-strip-brand">HomeAdvisor</div>
          </div>
        </div>
      </div>
      <div className="ms-footer">
        <div className="ms-footer-centered">
          <div className="ms-footer-left-title">CONTACT US</div>
          <div className="ms-footer-left-body">
            Contact us today or schedule your free drone inspection and let us
            help you discover the perfect solution for your home or business.
          </div>
          <div className="ms-footer-social">
            <a
              href="https://www.facebook.com/millerstormroofing?_rdc=2&_rdr#"
              target="_blank"
              rel="noopener noreferrer"
              className="ms-footer-social-link"
              aria-label="Facebook"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M13.8 8.9V7.2c0-.9.6-1.2 1.1-1.2h1.7V3.1h-2.3c-2.5 0-3.8 1.5-3.8 3.8v2h-2v2.7h2V21h3V11.6h2.4l.4-2.7H13.8z"
                />
              </svg>
            </a>
            <span className="ms-footer-social-icon" aria-label="Instagram">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm10 2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-5 3.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5zm0 2A1.5 1.5 0 1 0 13.5 12 1.5 1.5 0 0 0 12 10.5zm4.25-3.1a.9.9 0 1 1-.9-.9.9.9 0 0 1 .9.9z"
                />
              </svg>
            </span>
            <a
              href="https://www.linkedin.com/company/miller-storm-roofing-and-reconstruction/"
              target="_blank"
              rel="noopener noreferrer"
              className="ms-footer-social-link"
              aria-label="LinkedIn"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 9h4v12H3zM9 9h4v1.7c.6-1 1.7-2 3.7-2 3 0 4.3 1.9 4.3 5.1V21h-4v-6c0-1.5-.5-2.6-1.9-2.6-1 0-1.6.7-1.9 1.4-.1.2-.1.6-.1.9V21H9z"
                />
              </svg>
            </a>
            <a
              href="https://www.youtube.com/channel/UCTRZ-XaVO671kF4tOHm65BA"
              target="_blank"
              rel="noopener noreferrer"
              className="ms-footer-social-link"
              aria-label="YouTube"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3a2.7 2.7 0 0 0-1.9 1.9C2 9 2 12 2 12s0 3 .3 4.8a2.7 2.7 0 0 0 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3a2.7 2.7 0 0 0 1.9-1.9C22 15 22 12 22 12s0-3-.4-4.8zM10 15V9l5 3-5 3z"
                />
              </svg>
            </a>
          </div>
          <div className="ms-footer-left-phone">
            <div className="ms-footer-contact">
              {contactPhone && (
                <a href={`tel:${contactPhone}`} className="ms-footer-link ms-footer-contact-item">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M6.6 10.8c1.2 2.3 3.3 4.4 5.6 5.6l2-2c.3-.3.8-.4 1.2-.2 1 .3 2 .5 3.1.5.7 0 1.3.6 1.3 1.3V20c0 .7-.6 1.3-1.3 1.3C10.9 21.3 2.7 13.1 2.7 3.3 2.7 2.6 3.3 2 4 2h3.2c.7 0 1.3.6 1.3 1.3 0 1.1.2 2.1.5 3.1.1.4 0 .9-.3 1.2l-2.1 2.2z"
                    />
                  </svg>
                  <span>{contactPhone}</span>
                </a>
              )}
              {contactEmail && (
                <a href={`mailto:${contactEmail}`} className="ms-footer-link ms-footer-contact-item">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v.01L12 12l8-5.99V6H4zm16 12V8l-8 6-8-6v10h16z"
                    />
                  </svg>
                  <span>{contactEmail}</span>
                </a>
              )}
            </div>
          </div>
          <div className="ms-footer-copy">
            © 2026-2027{" "}
            <a
              href="https://millerstorm.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="ms-footer-link"
            >
              Miller Storm
            </a>
            . All Rights Reserved.
          </div>
          <div className="ms-footer-image">
            <Image
              src={footerImage}
              alt="Miller Storm footer"
              width={140}
              height={60}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BusinessCardsRequest() {
  return (
    <div className="business-cards">
      <div className="panel-header">Tools/ Apps</div>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Quantity</span>
          <input className="field-input" type="number" defaultValue={250} />
        </label>
        <label className="field">
          <span className="field-label">Notes for marketing</span>
          <textarea
            className="field-input"
            rows={3}
            placeholder="Any special instructions?"
          />
        </label>
      </div>
      <button
        className="btn-primary"
        onClick={() => alert("Business card request submitted (placeholder).")}
      >
        Submit Request
      </button>
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

export function SalesPortal(props: SalesPortalProps) {
  const [activeView, setActiveView] = useState<SalesViewId>("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const allowedItems = sidebarItems.filter((item) => {
    const moduleKey = viewToModuleKey[item.id];
    if (!moduleKey) {
      return true;
    }
    return props.profile.featureToggles[moduleKey] ?? true;
  });

  const safeActiveView: SalesViewId =
    allowedItems.find((item) => item.id === activeView)?.id ??
    allowedItems[0]?.id ??
    "dashboard";

  function renderView() {
    if (safeActiveView === "dashboard") {
      return <SalesDashboard profile={props.profile} />;
    }
    if (safeActiveView === "profile") {
      return (
        <ProfilePage
          profile={props.profile}
          onProfileChange={props.onProfileChange}
        />
      );
    }
    if (safeActiveView === "plan") {
      return (
        <BusinessPlanPage
          profile={props.profile}
          onProfileChange={props.onProfileChange}
        />
      );
    }
    if (safeActiveView === "training") {
      return <TrainingCenter courses={props.courses} />;
    }
    if (safeActiveView === "materials") {
      return <MarketingMaterials />;
    }
    if (safeActiveView === "webPage") {
      return (
        <WebPagePreview
          profile={props.profile}
          onProfileChange={props.onProfileChange}
        />
      );
    }
    if (safeActiveView === "businessCards") {
      return <BusinessCardsRequest />;
    }
    if (safeActiveView === "aiChat") {
      return <AiChatPanel />;
    }
    return null;
  }

  return (
    <Layout
      isSidebarCollapsed={isSidebarCollapsed}
      sidebar={
        <Sidebar
          header={<div className="sidebar-title">Sales Team Portal</div>}
          items={allowedItems}
          activeId={safeActiveView}
          onSelect={(id) => setActiveView(id as SalesViewId)}
          onLogout={props.onLogout}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />
      }
      header={
        <Header
          title="Sales OS"
          subtitle="Sales rep view"
          userName={props.currentUser.name}
          roleLabel="Sales Rep"
          onLogout={props.onLogout}
        />
      }
    >
      {renderView()}
    </Layout>
  );
}
