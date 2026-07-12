import { useEffect, useRef, useState } from "react";
import { appConfirm } from "../lib/appDialogs";
import Image from "next/image";
import { Layout } from "../components/Layout";
import { Sidebar } from "../components/Sidebar";
import { Header } from "../components/Header";
import { DashboardCard } from "../components/DashboardCard";
import {
  AuthenticatedUser,
  Course,
  CourseFolder,
  CoursePage,
  FeatureToggles,
  UserProfile,
  UserRole
} from "../types";
import headerLogo from "../../ref. images/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png";
import footerImage from "../../ref. images/image.png";
import { WebPagePreview as SalesWebPagePreview } from "./SalesPortal";

type AdminPortalProps = {
  currentUser: AuthenticatedUser;
  onLogout: () => void;
  users: UserProfile[];
  onUsersChange: (users: UserProfile[]) => void;
   courses: Course[];
   onCoursesChange: (courses: Course[]) => void;
};

type AdminViewId =
  | "dashboard"
  | "userManagement"
  | "roleHierarchy"
  | "businessUnits"
  | "salesOverview"
  | "marketingOverview"
  | "courseManagement"
  | "materialsLibrary"
  | "approvalWorkflows"
  | "aiBots"
  | "webTemplates"
  | "webText"
  | "appsTools";

const sidebarItems: { id: AdminViewId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "userManagement", label: "User Management" },
  { id: "roleHierarchy", label: "Role & Hierarchy Manager" },
  { id: "businessUnits", label: "Business Units" },
  { id: "salesOverview", label: "Sales Team Overview" },
  { id: "marketingOverview", label: "Marketing Overview" },
  { id: "courseManagement", label: "Course Management" },
  { id: "materialsLibrary", label: "Marketing Materials Library" },
  { id: "approvalWorkflows", label: "Approval Workflows" },
  { id: "aiBots", label: "AI Bot Management" },
  { id: "webTemplates", label: "Web Page Templates" },
  { id: "webText", label: "Web Text" },
  { id: "appsTools", label: "Apps/Tool" }
];

function AdminDashboard(props: { users: UserProfile[]; courses: Course[] }) {
  const totalSalesReps = props.users.filter((user) => user.role === "sales")
    .length;
  const totalManagers = props.users.filter((user) => user.role === "manager")
    .length;

  // Business Plan Roll-up Data
  const businessPlans = props.users
    .filter((user) => !!user.businessPlan)
    .map((user) => user.businessPlan!);

  const totalRevenue = businessPlans.reduce(
    (sum, plan) => sum + ((plan as any).targetRevenue || plan.revenueGoal || 0),
    0
  );
  const totalDays = businessPlans.reduce(
    (sum, plan) => sum + ((plan as any).daysToClose || plan.daysPerWeek || 0),
    0
  );
  const avgDays = businessPlans.length > 0 ? Math.round(totalDays / businessPlans.length) : 0;

  // Course Completion by Module
  const publishedCourses = props.courses.filter(
    (course) => course.status !== "draft"
  );

  function getUserCourseCompletion(user: UserProfile, course: Course) {
    const userCode =
      (user.id.charCodeAt(0) || 0) + (user.name.charCodeAt(0) || 0);
    const courseCode = course.id.charCodeAt(0) || 0;
    const raw = (userCode * 7 + courseCode * 11) % 101;
    return raw;
  }

  const completionValues: number[] = [];

  props.users.forEach((user) => {
    if (user.role !== "sales" && user.role !== "manager") {
      return;
    }
    publishedCourses.forEach((course) => {
      completionValues.push(getUserCourseCompletion(user, course));
    });
  });

  const totalCourseCompletionPercentage =
    completionValues.length > 0
      ? Math.round(
          completionValues.reduce((sum, value) => sum + value, 0) /
            completionValues.length
        )
      : 0;

  // Bot Dashboard Data
  const totalBots = 3;
  const totalChatSessions = 1247;
  const totalBotUpdates = 18;

  const socialPlatforms = [
    {
      id: "instagram",
      name: "Instagram",
      followers: 18250,
      posts30d: 36,
      views30d: 245000
    },
    {
      id: "tiktok",
      name: "TikTok",
      followers: 30420,
      posts30d: 28,
      views30d: 612000
    },
    {
      id: "facebook",
      name: "Facebook",
      followers: 9450,
      posts30d: 18,
      views30d: 121000
    },
    {
      id: "youtube",
      name: "YouTube",
      followers: 12780,
      posts30d: 12,
      views30d: 398000
    }
  ];

  const totalFollowers = socialPlatforms.reduce(
    (sum, platform) => sum + platform.followers,
    0
  );
  const totalPosts30d = socialPlatforms.reduce(
    (sum, platform) => sum + platform.posts30d,
    0
  );
  const totalViews30d = socialPlatforms.reduce(
    (sum, platform) => sum + platform.views30d,
    0
  );

  return (
    <div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Sales Reps & Managers</span>
          </div>
        </div>
        <div className="panel-body">
          <div className="grid grid-4">
            <DashboardCard
              title="Total Sales Reps"
              value={totalSalesReps.toString()}
            />
            <DashboardCard
              title="Total Managers"
              value={totalManagers.toString()}
            />
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Business Plan Roll-up</span>
          </div>
        </div>
        <div className="panel-body">
          <div className="grid grid-4">
            <DashboardCard
              title="Total Business Plans"
              value={businessPlans.length.toString()}
            />
            <DashboardCard
              title="Total Revenue"
              value={`$${totalRevenue.toLocaleString()}`}
            />
            <DashboardCard
              title="Avg Days to Close"
              value={avgDays.toString()}
            />
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Course Completion by Module</span>
          </div>
        </div>
        <div className="panel-body">
          <div className="grid grid-4">
            <DashboardCard
              title="Total Course Completion"
              value={`${totalCourseCompletionPercentage}%`}
              description="Across all trainings"
            />
            {publishedCourses.map((course) => {
              const courseCompletions = props.users
                .filter((u) => u.role === "sales" || u.role === "manager")
                .map((u) => getUserCourseCompletion(u, course));
              const avgCompletion =
                courseCompletions.length > 0
                  ? Math.round(
                      courseCompletions.reduce((sum, val) => sum + val, 0) /
                        courseCompletions.length
                    )
                  : 0;
              return (
                <DashboardCard
                  key={course.id}
                  title={course.title}
                  value={`${avgCompletion}%`}
                  description="Module completion"
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Bot Dashboard</span>
          </div>
        </div>
        <div className="panel-body">
          <div className="grid grid-4">
            <DashboardCard
              title="Total Bots"
              value={totalBots.toString()}
            />
            <DashboardCard
              title="Total Chat Sessions"
              value={totalChatSessions.toLocaleString()}
            />
            <DashboardCard
              title="Total Bot Updates"
              value={totalBotUpdates.toString()}
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Social Media Dashboard</span>
          </div>
        </div>
        <div className="panel-body">
          <div className="grid grid-3" style={{ marginBottom: 16 }}>
            <DashboardCard
              title="Total Followers"
              value={totalFollowers.toLocaleString()}
            />
            <DashboardCard
              title="Posts (Last 30 Days)"
              value={totalPosts30d.toLocaleString()}
            />
            <DashboardCard
              title="Views (Last 30 Days)"
              value={totalViews30d.toLocaleString()}
            />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(0, 180px) repeat(3, minmax(0, 160px))",
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
            <div>Platform</div>
            <div style={{ textAlign: "right" }}>Followers</div>
            <div style={{ textAlign: "right" }}>Posts (30 days)</div>
            <div style={{ textAlign: "right" }}>Views (30 days)</div>
          </div>
          {socialPlatforms.map((platform, index) => (
            <div
              key={platform.id}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 180px) repeat(3, minmax(0, 160px))",
                columnGap: 12,
                rowGap: 8,
                alignItems: "center",
                padding: "8px 0",
                borderTop:
                  index === 0 ? "1px solid #e5e7eb" : "1px solid #f1f5f9",
                backgroundColor:
                  index % 2 === 0 ? "#ffffff" : "#f9fafb",
                fontSize: 13
              }}
            >
              <div>{platform.name}</div>
              <div style={{ textAlign: "right" }}>
                {platform.followers.toLocaleString()}
              </div>
              <div style={{ textAlign: "right" }}>
                {platform.posts30d.toLocaleString()}
              </div>
              <div style={{ textAlign: "right" }}>
                {platform.views30d.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type UserEditorProps = {
  users: UserProfile[];
  deletedUsers: UserProfile[];
  onUsersChange: (users: UserProfile[]) => void;
  onDeletedUsersChange: (users: UserProfile[]) => void;
};

function UserManagement(props: UserEditorProps) {
  const [draftUsers, setDraftUsers] = useState<UserProfile[]>(props.users);
  const [draftDeletedUsers, setDraftDeletedUsers] = useState<UserProfile[]>(
    props.deletedUsers
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const saveNoticeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedUserId, setSelectedUserId] = useState(
    props.users[0]?.id ?? ""
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showWebPreview, setShowWebPreview] = useState(false);
  const [showRolesDropdown, setShowRolesDropdown] = useState(false);
  const [managerDraftId, setManagerDraftId] = useState<string>(
    props.users.find((u) => u.id === selectedUserId)?.managerId ?? ""
  );

  const featureToggleKeysByRole: Record<
    UserProfile["role"],
    (keyof FeatureToggles)[]
  > = {
    admin: [
      "dashboard",
      "userManagement",
      "roleHierarchy",
      "businessUnits",
      "salesOverview",
      "marketingOverview",
      "courseManagement",
      "materialsLibrary",
      "approvalWorkflows",
      "aiBots",
      "webTemplates",
      "webText",
      "appsTools",
      "socialMediaMetrics"
    ],
    manager: [
      "dashboard",
      "team",
      "plans",
      "training",
      "onlineTraining",
      "taskTracker",
      "webTemplates"
    ],
    sales: [
      "dashboard",
      "profile",
      "plan",
      "training",
      "materials",
      "aiChat",
      "webPage",
      "businessCards"
    ],
    marketing: [
      "dashboard",
      "assets",
      "approvals",
      "socialMetrics"
    ],
    // C-Level has a fixed feature set (no per-user toggles).
    "c-level": []
  };

  const featureToggleLabels: Record<string, string> = {
    dashboard: "Dashboard",
    userManagement: "User Management",
    roleHierarchy: "Role & Hierarchy Manager",
    businessUnits: "Business Units",
    salesOverview: "Sales Team Overview",
    marketingOverview: "Marketing Overview",
    courseManagement: "Course Management",
    materialsLibrary: "Marketing Materials Library",
    approvalWorkflows: "Approval Workflows",
    aiBots: "AI Bot Management",
    webTemplates: "Web Page Approval",
    webText: "Web Text",
    appsTools: "Apps/Tool",
    socialMediaMetrics: "Social Media Metrics",
    team: "My Team",
    plans: "Team Business Plans",
    training: "Training Center",
    onlineTraining: "Online Training",
    taskTracker: "Task Tracker",
    profile: "My Profile",
    plan: "My Business Plan",
    materials: "Marketing Materials",
    aiChat: "Jay Miller's Clone",
    webPage: "My Web Page",
    businessCards: "Tools/ Apps",
    assets: "Marketing Assets",
    approvals: "Approval Queue",
    socialMetrics: "Social Metrics"
  };

  const selectedUser = draftUsers.find((u) => u.id === selectedUserId);
  const showManagerField = selectedUser?.role === "sales";
  
  // Get all roles for the user (including primary role and additional roles)
  const userRoles = selectedUser ? [selectedUser.role, ...(selectedUser.roles || [])] : [];
  const uniqueRoles = [...new Set(userRoles)];
  
  // Get toggles grouped by role
  const togglesByRole = uniqueRoles.map(role => ({
    role,
    keys: featureToggleKeysByRole[role].filter(
      (key) => selectedUser && key in selectedUser.featureToggles
    )
  }));

  const roleLabels: Record<UserRole, string> = {
    admin: "Admin Panel",
    "c-level": "C-Level Panel",
    manager: "Manager Panel",
    sales: "Sales Panel",
    marketing: "Marketing Panel"
  };

  useEffect(() => {
    const current = draftUsers.find((u) => u.id === selectedUserId);
    setManagerDraftId(current?.managerId ?? "");
  }, [selectedUserId, draftUsers]);

  useEffect(() => {
    setShowWebPreview(false);
  }, [selectedUserId]);

  useEffect(() => {
    if (!isDirty) {
      setDraftUsers(props.users);
      setDraftDeletedUsers(props.deletedUsers);
      if (!props.users.find((u) => u.id === selectedUserId)) {
        setSelectedUserId(props.users[0]?.id ?? "");
      }
    }
  }, [props.users, props.deletedUsers, isDirty, selectedUserId]);

  useEffect(() => {
    if (!draftUsers.length) {
      if (selectedUserId) {
        setSelectedUserId("");
      }
      return;
    }
    if (!draftUsers.find((u) => u.id === selectedUserId)) {
      setSelectedUserId(draftUsers[0].id);
    }
  }, [draftUsers, selectedUserId]);

  useEffect(() => {
    return () => {
      if (saveNoticeTimeout.current) {
        clearTimeout(saveNoticeTimeout.current);
      }
    };
  }, []);

  function updateUser(updated: UserProfile) {
    const nextUser =
      updated.id.startsWith("user-") && updated.email.trim().length > 0
        ? { ...updated, id: updated.email.trim() }
        : updated;
    const next = draftUsers.map((u) => (u.id === updated.id ? nextUser : u));
    setDraftUsers(next);
    setIsDirty(true);
    if (selectedUserId === updated.id && nextUser.id !== updated.id) {
      setSelectedUserId(nextUser.id);
    }
  }

  function applyManagerAssignment(targetManagerId: string) {
    if (!selectedUser) {
      return;
    }
    updateUser({
      ...selectedUser,
      managerId: targetManagerId || undefined
    });
  }

  function createUser() {
    const template = draftUsers[0];
    const baseToggles: FeatureToggles = template
      ? { ...template.featureToggles }
      : ({} as FeatureToggles);

    const newUser: UserProfile = {
      id: `user-${Date.now()}`,
      name: "New User",
      email: "",
      password: "",
      role: "sales",
      strengths: "",
      weaknesses: "",
      phone: "",
      territory: "",
      publicProfile: {
        showHeadshot: false,
        showEmail: false,
        showPhone: false,
        showStrengths: false,
        showWeaknesses: false,
        showTerritory: false
      },
      featureToggles: baseToggles
    };

    const next = [...draftUsers, newUser];
    setDraftUsers(next);
    setIsDirty(true);
    setSelectedUserId(newUser.id);
  }

  function deleteUser(userId: string) {
    const next = draftUsers.filter((u) => u.id !== userId);
    const deleted = draftUsers.find((u) => u.id === userId);
    if (deleted) {
      setDraftDeletedUsers([...draftDeletedUsers, deleted]);
    }
    setDraftUsers(next);
    setIsDirty(true);
    if (!next.length) {
      setSelectedUserId("");
      return;
    }
    if (selectedUserId === userId) {
      setSelectedUserId(next[0].id);
    }
  }

  function updateFeatureToggles(user: UserProfile, toggles: Partial<FeatureToggles>) {
    updateUser({
      ...user,
      featureToggles: {
        ...user.featureToggles,
        ...toggles
      }
    });
  }

  const splitParagraphs = (value: string) =>
    value
      .split(/\n\s*\n/g)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

  const missionTitle = selectedUser?.missionTitle || selectedUser?.name || "MY BIO";
  const missionBody = selectedUser?.missionBody ?? selectedUser?.bio ?? "";
  const marketingMaterialsNotes = selectedUser?.marketingMaterialsNotes ?? "";
  const missionImageUrl =
    selectedUser?.missionImageUrl || selectedUser?.headshotUrl || "";
  const whyUsTitle = selectedUser?.whyUsTitle || "HERE’S WHY YOU NEED US";
  const whyUsBody =
    selectedUser?.whyUsBody || marketingMaterialsNotes || "";
  const expertRoofersTitle =
    selectedUser?.expertRoofersTitle || "EXPERT ROOFERS AT YOUR SERVICE";
  const expertRoofersBody = selectedUser?.expertRoofersBody || "";
  const missionParagraphs = splitParagraphs(missionBody);
  const whyUsParagraphs = splitParagraphs(whyUsBody);
  const expertRoofersParagraphs = splitParagraphs(expertRoofersBody);

  return (
    <div className="admin-user-management">
      <div className="panel panel-left">
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Users</span>
            <button
              type="button"
              className="btn-primary btn-success"
              onClick={createUser}
            >
              + Add User
            </button>
          </div>
        </div>
        <div className="panel-body">
          <div className="panel-section">
            <div className="panel-section-title">Active Users</div>
            <div className="list">
              {draftUsers.map((user) => {
                const isActive = user.id === selectedUserId;
                return (
                  <button
                    key={user.id}
                    className={isActive ? "list-item active" : "list-item"}
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8
                      }}
                    >
                      <div>
                        <div className="list-item-title">{user.name}</div>
                        <div className="list-item-subtitle">
                          {(user.roles || [user.role]).map(r => r.toUpperCase()).join(", ")} • {user.email}
                          {user.suspended && <span style={{ color: "#dc2626", marginLeft: 8 }}>• SUSPENDED</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          {draftDeletedUsers.length > 0 && (
            <div className="panel-section">
              <div className="panel-section-title">Deleted Users</div>
              <div className="list">
                {draftDeletedUsers.map((user) => (
                  <div key={user.id} className="list-item">
                    <div style={{ flex: 1 }}>
                      <div className="list-item-title">{user.name}</div>
                      <div className="list-item-subtitle">
                        {(user.roles || [user.role]).map(r => r.toUpperCase()).join(", ")} • {user.email}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary btn-success btn-small"
                      onClick={() => {
                        const restored = draftDeletedUsers.find((u) => u.id === user.id);
                        if (restored) {
                          setDraftUsers([...draftUsers, restored]);
                          setDraftDeletedUsers(draftDeletedUsers.filter((u) => u.id !== user.id));
                          setIsDirty(true);
                        }
                      }}
                    >
                      Restore User
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="panel panel-right">
        {selectedUser ? (
          <div className="panel-scroll">
            <div className="panel-header">
              <div className="panel-header-row">
                <span>User Details{selectedUser.suspended && <span style={{ color: "#dc2626", marginLeft: 8 }}>• SUSPENDED</span>}</span>
                <div className="panel-header-actions">
                  <button
                    type="button"
                    className="btn-primary btn-small"
                    disabled={!isDirty}
                    onClick={() => {
                      const usersToSave = draftUsers.map((user) => {
                        if (user.password && user.password.trim().length > 0) {
                          return { ...user };
                        }
                        const { password, ...rest } = user;
                        return rest;
                      });
                      props.onUsersChange(usersToSave);
                      props.onDeletedUsersChange(draftDeletedUsers);
                      setDraftUsers(
                        usersToSave.map((user) => {
                          const { password, ...rest } = user as UserProfile;
                          return rest;
                        })
                      );
                      setIsDirty(false);
                      setSaveNotice("Changes saved successfully");
                      if (saveNoticeTimeout.current) {
                        clearTimeout(saveNoticeTimeout.current);
                      }
                      saveNoticeTimeout.current = setTimeout(() => {
                        setSaveNotice("");
                      }, 2000);
                    }}
                  >
                    Save Changes
                  </button>
                  {saveNotice && (
                    <span
                      style={{
                        fontSize: 12,
                        color: "#16a34a"
                      }}
                    >
                      {saveNotice}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn-secondary btn-warning btn-small"
                    onClick={async () => {
                      if (await appConfirm(`Suspend ${selectedUser.name}?`)) {
                        updateUser({ ...selectedUser, suspended: true });
                      }
                    }}
                  >
                    Suspend User
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-danger"
                    onClick={async () => {
                      if (await appConfirm(`Delete ${selectedUser.name}?`)) {
                        deleteUser(selectedUser.id);
                      }
                    }}
                  >
                    Delete User
                  </button>
                </div>
              </div>
            </div>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="field-input"
                  value={selectedUser.name}
                  onChange={(e) =>
                    updateUser({ ...selectedUser, name: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Email</span>
                <input
                  className="field-input"
                  value={selectedUser.email}
                  onChange={(e) =>
                    updateUser({ ...selectedUser, email: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Reset Password</span>
                <div
                  className="field-input"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    paddingRight: 8
                  }}
                >
                  <input
                    type={showPassword ? "text" : "password"}
                    value={selectedUser.password ?? ""}
                    onChange={(e) =>
                      updateUser({ ...selectedUser, password: e.target.value })
                    }
                    placeholder="Set a login password"
                    style={{
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      flex: 1,
                      minWidth: 0
                    }}
                  />
                  <button
                    type="button"
                    className="btn-ghost btn-small"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    style={{ padding: 4 }}
                  >
                    {showPassword ? (
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17.94 17.94 6.06 6.06" />
                        <path d="M9.88 9.88A3 3 0 0 0 12 15a3 3 0 0 0 2.12-.88" />
                        <path d="M6.23 6.23C4.05 7.62 2.54 9.8 2 12c1.73 4.11 5.7 7 10 7 1.59 0 3.11-.38 4.45-1.07" />
                        <path d="M14.12 5.1C13.44 4.88 12.73 4.76 12 4.76c-4.3 0-8.27 2.89-10 7 0 .02 0 .04.01.06" />
                        <path d="M19.78 19.78C21.04 18.26 21.99 16.28 22 12c-1.33-3.17-4.09-5.71-7.33-6.72" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>
              <label className="field">
                <span className="field-label">Role</span>
                <div className="territory-field">
                  <button
                    type="button"
                    className={showRolesDropdown ? "territory-trigger territory-trigger-open" : "territory-trigger"}
                    onClick={() => setShowRolesDropdown(!showRolesDropdown)}
                  >
                    <span className="territory-trigger-value">
                      {selectedUser.role.charAt(0).toUpperCase() + selectedUser.role.slice(1)}
                    </span>
                    <span className="territory-trigger-icon">{showRolesDropdown ? "▲" : "▼"}</span>
                  </button>
                  {showRolesDropdown && (
                    <div className="territory-dropdown" style={{ gridTemplateColumns: "1fr" }}>
                      {(["admin", "manager", "sales", "marketing"] as UserRole[]).map((role) => (
                        <div
                          key={role}
                          className={selectedUser.role === role ? "territory-option territory-option-active" : "territory-option"}
                          onClick={() => {
                            const newRoles = [role];
                            updateUser({
                              ...selectedUser,
                              role: role,
                              roles: newRoles,
                              managerId: role === "sales" ? selectedUser.managerId : undefined
                            });
                            setShowRolesDropdown(false);
                          }}
                        >
                          <input
                            type="radio"
                            checked={selectedUser.role === role}
                            readOnly
                          />
                          <span style={{ textTransform: "capitalize" }}>{role}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </label>
              {selectedUser.role === "sales" && (
                <label className="field">
                  <span className="field-label">Manager</span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8
                    }}
                  >
                    <select
                      className="field-input"
                      style={{ flex: 1 }}
                      value={managerDraftId}
                      onChange={(e) => {
                        const nextManagerId = e.target.value;
                        setManagerDraftId(nextManagerId);
                        updateUser({
                          ...selectedUser,
                          managerId: nextManagerId || undefined
                        });
                      }}
                    >
                      <option value="">No manager</option>
                      {draftUsers
                        .filter((u) => u.role === "manager")
                        .map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </label>
              )}
            </div>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Strengths / Superpowers</span>
                <textarea
                  className="field-input"
                  rows={3}
                  value={selectedUser.strengths}
                  onChange={(e) =>
                    updateUser({ ...selectedUser, strengths: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Weaknesses / Insecurities</span>
                <textarea
                  className="field-input"
                  rows={3}
                  value={selectedUser.weaknesses}
                  onChange={(e) =>
                    updateUser({ ...selectedUser, weaknesses: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="panel-section">
              <div className="panel-section-title">Rep Web Page Status</div>
              <div className="status-row">
                <span className="status-label">Status</span>
                <span
                  className={
                    "status-chip " + (selectedUser.webPage?.status ?? "draft")
                  }
                >
                  {selectedUser.webPage?.status ?? "draft"}
                </span>
              </div>
              <div className="status-actions">
                <button
                  className="btn-secondary btn-dark btn-small"
                  type="button"
                  onClick={() => setShowWebPreview((prev) => !prev)}
                >
                  <span className="btn-with-icon">
                    {showWebPreview ? (
                      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm-7-5l-2-2 10-6 2 2-10 6z"
                        />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M12 5c7 0 10 7 10 7s-3 7-10 7S2 12 2 12s3-7 10-7zm0 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"
                        />
                      </svg>
                    )}
                    <span>{showWebPreview ? "Hide" : "View"}</span>
                  </span>
                </button>
              </div>
            </div>
            {showWebPreview && selectedUser && (
              <div className="panel-section">
                <div className="panel-section-title">Rep Web Page Preview</div>
                <SalesWebPagePreview
                  profile={selectedUser}
                  onProfileChange={updateUser}
                />
              </div>
            )}
            <div style={{ marginTop: 40 }}></div>
            <div className="panel-section">
              <div className="panel-section-title">Feature Toggles</div>
              {togglesByRole.map(({ role, keys }) => (
                <div key={role} style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#666" }}>
                    {roleLabels[role]}
                  </div>
                  <div className="toggle-grid">
                    {keys.map((key) => {
                      const enabled = selectedUser.featureToggles[key];
                      const label = featureToggleLabels[key] || key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (str) => str.toUpperCase())
                        .replace(/ai/gi, "AI")
                        .trim();
                      return (
                        <label key={key} className="toggle-item">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) =>
                              updateFeatureToggles(selectedUser, {
                                [key]: e.target.checked
                              } as Partial<FeatureToggles>)
                            }
                          />
                          <span className="toggle-label">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="panel-empty">Select a user to manage details.</div>
        )}
      </div>
    </div>
  );
}

type BotConfig = {
  id: string;
  name: string;
  description: string;
  awareOfStrengths: boolean;
  assignedTo?: string;
  assignedType?: "course" | "lesson" | "global";
};

const initialBots: BotConfig[] = [
  {
    id: "ceo-bot",
    name: "CEO Bot (Jay Clone)",
    description: "Exec-level narratives, culture, and strategic context for the field.",
    awareOfStrengths: true,
    assignedType: "global"
  },
  {
    id: "sales-coach",
    name: "Sales Coach Bot",
    description: "Deal coaching, objection handling, and field scenarios.",
    awareOfStrengths: true,
    assignedType: "global"
  },
  {
    id: "marketing-assistant",
    name: "Marketing Assistant Bot",
    description: "Campaign planning, copy suggestions, and asset recommendations.",
    awareOfStrengths: false,
    assignedType: "global"
  }
];

function AiBotManagement(props: { courses: Course[] }) {
  const [bots, setBots] = useState<BotConfig[]>(initialBots);
  const [isCreating, setIsCreating] = useState(false);
  const [newBotName, setNewBotName] = useState("");
  const [newBotDescription, setNewBotDescription] = useState("");

  function createBot() {
    if (!newBotName.trim()) return;
    const newBot: BotConfig = {
      id: `bot-${Date.now()}`,
      name: newBotName,
      description: newBotDescription,
      awareOfStrengths: false,
      assignedType: "global"
    };
    setBots([...bots, newBot]);
    setIsCreating(false);
    setNewBotName("");
    setNewBotDescription("");
  }

  const allLessons: { courseId: string; courseTitle: string; pageId: string; pageTitle: string }[] = [];
  props.courses.forEach((course) => {
    (course.pages || []).forEach((page) => {
      allLessons.push({
        courseId: course.id,
        courseTitle: course.title,
        pageId: page.id,
        pageTitle: page.title
      });
    });
  });

  return (
    <div className="ai-bot-management">
      <div className="panel-header">
        <div className="panel-header-row">
          <span>AI Bot Management</span>
          <button
            type="button"
            className="btn-primary btn-success btn-small"
            onClick={() => setIsCreating(true)}
          >
            + Create Bot
          </button>
        </div>
      </div>
      {isCreating && (
        <div className="panel-body" style={{ borderBottom: "1px solid #e5e7eb", marginBottom: 16 }}>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Bot Name</span>
              <input
                className="field-input"
                value={newBotName}
                onChange={(e) => setNewBotName(e.target.value)}
                placeholder="Enter bot name"
              />
            </label>
            <label className="field">
              <span className="field-label">Description</span>
              <input
                className="field-input"
                value={newBotDescription}
                onChange={(e) => setNewBotDescription(e.target.value)}
                placeholder="Enter description"
              />
            </label>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn-primary btn-success"
              onClick={createBot}
            >
              Create
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setIsCreating(false);
                setNewBotName("");
                setNewBotDescription("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="panel-body list">
        {bots.map((bot) => (
          <div key={bot.id} className="card card-row">
            <div className="card-main">
              <div className="card-title">{bot.name}</div>
              <div className="card-description">{bot.description}</div>
              <div className="field" style={{ marginTop: 12 }}>
                <span className="field-label">Assign To</span>
                <select
                  className="field-input"
                  value={bot.assignedTo || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    const [type, id] = value.split(":");
                    setBots(
                      bots.map((b) =>
                        b.id === bot.id
                          ? {
                              ...b,
                              assignedTo: id || undefined,
                              assignedType: (type as "course" | "lesson" | "global") || "global"
                            }
                          : b
                      )
                    );
                  }}
                >
                  <option value="global:">Global (All Users)</option>
                  {props.courses.map((course) => (
                    <option key={course.id} value={`course:${course.id}`}>
                      Course: {course.title}
                    </option>
                  ))}
                  {allLessons.map((lesson) => (
                    <option key={lesson.pageId} value={`lesson:${lesson.pageId}`}>
                      Lesson: {lesson.courseTitle} - {lesson.pageTitle}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="field-label">
                  Knowledge Base Upload
                  <span
                    style={{
                      marginLeft: 8,
                      cursor: "pointer",
                      color: "#6b7280",
                      fontSize: 12
                    }}
                    title="Supported formats: PDF, DOCX, TXT, MD, CSV (Max 10MB per file)"
                  >
                    ⓘ Info
                  </span>
                </span>
                <div className="field-inline">
                  <button className="btn-secondary">Upload Files</button>
                  <button className="btn-secondary">Manage Sources</button>
                </div>
              </div>
            </div>
            <div className="card-side">
              <label className="toggle-item">
                <input
                  type="checkbox"
                  checked={bot.awareOfStrengths}
                  onChange={(e) =>
                    setBots(
                      bots.map((b) =>
                        b.id === bot.id
                          ? { ...b, awareOfStrengths: e.target.checked }
                          : b
                      )
                    )
                  }
                />
                <span className="toggle-label">
                  Aware of user strengths/weaknesses
                </span>
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleHierarchyManager(props: {
  users: UserProfile[];
  onUsersChange: (users: UserProfile[]) => void;
}) {
  const ceos = props.users.filter((user) => user.role === "admin");
  const managers = props.users.filter((user) => user.role === "manager");
  const salesReps = props.users.filter((user) => user.role === "sales");
  const totalManagers = managers.length;
  const totalSalesReps = salesReps.length;

  const [draggingUserId, setDraggingUserId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    userId: string;
    targetManagerId: string | null;
  } | null>(null);

  const unassignedUsers = props.users.filter(
    (user) =>
      user.role !== "admin" &&
      (user.managerId === undefined || user.managerId === "")
  );

  function getDirectReports(managerId: string) {
    return props.users.filter((user) => user.managerId === managerId);
  }

  function getManagerChain(user: UserProfile): UserProfile[] {
    const chain: UserProfile[] = [];
    let current = user;
    let depth = 0;

    while (current.managerId && depth < 7) {
      const manager = props.users.find((u) => u.id === current.managerId);
      if (!manager) {
        break;
      }
      chain.push(manager);
      current = manager;
      depth += 1;
    }

    return chain;
  }

  async function moveUserToManager(userId: string, targetManagerId: string | null) {
    const user = props.users.find((u) => u.id === userId);
    if (!user) {
      return;
    }

    const currentManager = user.managerId
      ? props.users.find((u) => u.id === user.managerId)
      : null;
    const targetManager = targetManagerId
      ? props.users.find((u) => u.id === targetManagerId)
      : null;

    const nextManagerId = targetManagerId ?? undefined;

    if (!currentManager || !targetManager) {
      const next = props.users.map((u) =>
        u.id === user.id
          ? {
              ...u,
              managerId: nextManagerId
            }
          : u
      );
      props.onUsersChange(next);
      return;
    }

    const currentToggles = currentManager.featureToggles;
    const targetToggles = targetManager.featureToggles;

    const togglesThatWouldBeLost: string[] = [];

    Object.keys(currentToggles).forEach((key) => {
      const k = key as keyof typeof currentToggles;
      if (currentToggles[k] && !targetToggles[k]) {
        togglesThatWouldBeLost.push(key);
      }
    });

    if (!togglesThatWouldBeLost.length) {
      const next = props.users.map((u) =>
        u.id === user.id
          ? {
              ...u,
              managerId: nextManagerId
            }
          : u
      );
      props.onUsersChange(next);
      return;
    }

    setPendingMove({ userId, targetManagerId: nextManagerId ?? null });

    const message = [
      `${user.name} may lose access to the following features if moved under ${targetManager.name}:`,
      "",
      togglesThatWouldBeLost.join(", "),
      "",
      "Do you want to continue?"
    ].join("\n");

    const confirmed = await appConfirm(message);

    if (!confirmed) {
      setPendingMove(null);
      return;
    }

    const nextFeatures = { ...user.featureToggles };
    togglesThatWouldBeLost.forEach((key) => {
      const k = key as keyof typeof nextFeatures;
      nextFeatures[k] = false;
    });

    const next = props.users.map((u) =>
      u.id === user.id
        ? {
            ...u,
            managerId: nextManagerId,
            featureToggles: nextFeatures
          }
        : u
    );
    props.onUsersChange(next);
    setPendingMove(null);
  }

  function handleDropOnManager(managerId: string | null) {
    if (!draggingUserId) {
      return;
    }
    moveUserToManager(draggingUserId, managerId);
    setDraggingUserId(null);
  }

  function renderOrgNode(user: UserProfile, depth: number = 0) {
    if (depth >= 7) {
      return null;
    }

    const directReports = getDirectReports(user.id);

    return (
      <div
        key={user.id}
        className="org-node"
        draggable
        onDragStart={() => setDraggingUserId(user.id)}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDropOnManager(user.id);
        }}
      >
        <div className="org-node-card">
          <div className="org-node-name">{user.name}</div>
          <div className="org-node-meta">
            {user.role.toUpperCase()}
            {directReports.length > 0 && ` • ${directReports.length} reports`}
          </div>
        </div>
        {directReports.length > 0 && depth < 6 && (
          <div className="org-node-children">
            {directReports.map((child) => renderOrgNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  const rootNodes =
    ceos.length > 0
      ? ceos
      : managers.filter(
          (manager) => !getManagerChain(manager).length
        );

  return (
    <div className="role-hierarchy">
      <div className="grid grid-3">
        <DashboardCard
          title="Total Managers"
          value={totalManagers.toString()}
          description="Users with Manager role"
        />
        <DashboardCard
          title="Total Sales Reps"
          value={totalSalesReps.toString()}
          description="Users with Sales Rep role"
        />
        <DashboardCard
          title="Levels Supported"
          value="7"
          description="Org depth from top-level"
        />
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Org Chart</span>
          </div>
        </div>
        <div className="panel-body">
          {props.users.length === 0 ? (
            <div className="panel-empty">No users available.</div>
          ) : (
            <div className="org-layout">
              <div className="org-chart-column">
                <div className="panel-section-title">Hierarchy</div>
                {rootNodes.length === 0 ? (
                  <div className="panel-empty">
                    No top-level managers. Assign Manager role to users to start
                    building the org chart.
                  </div>
                ) : (
                  <div className="org-tree">
                    {rootNodes.map((root) => renderOrgNode(root, 0))}
                  </div>
                )}
              </div>
              <div className="org-unassigned-column">
                <div className="panel-section-title">
                  Unassigned Users (must be attached to a manager)
                </div>
                {unassignedUsers.length === 0 ? (
                  <div className="panel-empty">
                    All non-admin users are assigned to a manager.
                  </div>
                ) : (
                  <div
                    className="list"
                    onDragOver={(e) => {
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropOnManager(null);
                    }}
                  >
                    {unassignedUsers.map((user) => (
                      <div
                        key={user.id}
                        className="list-item"
                        draggable
                        onDragStart={() => setDraggingUserId(user.id)}
                      >
                        <div className="list-item-title">{user.name}</div>
                        <div className="list-item-subtitle">
                          {user.role.toUpperCase()} • {user.email}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type CourseEditorProps = {
  courses: Course[];
  onCoursesChange: (courses: Course[]) => void;
};

function CourseManagement(props: CourseEditorProps) {
  const [selectedCourseId, setSelectedCourseId] = useState(
    props.courses[0]?.id ?? ""
  );
  const [viewMode, setViewMode] = useState<"grid" | "detail">(
    props.courses.length ? "grid" : "detail"
  );
  const [page, setPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [detailSection, setDetailSection] = useState<"overview" | "pages">(
    "overview"
  );
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [openPageMenuId, setOpenPageMenuId] = useState<string | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [isCourseMenuOpen, setIsCourseMenuOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderPublished, setNewFolderPublished] = useState(true);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [videoUrlDraft, setVideoUrlDraft] = useState("");
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkLabelDraft, setLinkLabelDraft] = useState("");
  const [linkUrlDraft, setLinkUrlDraft] = useState("");
  const bodyInputRef = useRef<HTMLTextAreaElement | null>(null);

  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(props.courses.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const visibleCourses = props.courses.slice(
    startIndex,
    startIndex + pageSize
  );

  const selectedCourse = props.courses.find(
    (course) => course.id === selectedCourseId
  );

  function updateCourse(updated: Course) {
    const next = props.courses.map((course) =>
      course.id === updated.id ? updated : course
    );
    props.onCoursesChange(next);
  }

  function createCourse() {
    const newCourse: Course = {
      id: `course-${Date.now()}`,
      title: "New Course",
      tagline: "",
      description: "",
      lessonNames: [],
      assetFiles: [],
      marketingDocs: [],
      icon: "📘",
      difficultyLabel: "Medium",
      timeLabel: "Medium",
      difficultyScore: 50,
      timeScore: 50,
      riskScore: 0,
      capitalScore: 0,
      personalityScore: 50,
      quizQuestions: [],
      links: [],
      status: "draft",
      coverImageUrl: "",
      accessMode: "open",
      pages: [
        {
          id: `page-${Date.now()}`,
          title: "New page",
          status: "draft",
          body: "",
          videoUrl: "",
          resourceLinks: [],
          fileUrls: []
        }
      ]
    };

    const next = [...props.courses, newCourse];
    props.onCoursesChange(next);
    setSelectedCourseId(newCourse.id);
    setViewMode("detail");
    setDetailSection("overview");
  }

  function deleteCourse(id: string) {
    const next = props.courses.filter((course) => course.id !== id);
    props.onCoursesChange(next);
    if (!next.length) {
      setSelectedCourseId("");
      return;
    }
    if (selectedCourseId === id) {
      setSelectedCourseId(next[0].id);
    }
  }

  function addPageForCourse(course: Course, folderId?: string) {
    const pages = course.pages ?? [];
    const newPage: CoursePage = {
      id: `page-${Date.now()}`,
      title: "New page",
      status: "draft",
      body: "",
      folderId,
      videoUrl: "",
      resourceLinks: [],
      fileUrls: []
    };
    const nextCourse: Course = {
      ...course,
      pages: [...pages, newPage]
    };
    updateCourse(nextCourse);
    setDetailSection("pages");
    setActivePageId(newPage.id);
    setOpenPageMenuId(null);
    setIsCourseMenuOpen(false);
  }

  function addFolderForCourse(course: Course) {
    const folders: CourseFolder[] = course.folders ?? [];
    const status: CourseFolder["status"] = newFolderPublished
      ? "published"
      : "draft";

    if (editingFolderId) {
      const nextFolders = folders.map((folder) =>
        folder.id === editingFolderId
          ? {
              ...folder,
              title: newFolderName.trim() || "Untitled folder",
              status
            }
          : folder
      );
      const nextCourse: Course = {
        ...course,
        folders: nextFolders
      };
      updateCourse(nextCourse);
    } else {
      const newFolder: CourseFolder = {
        id: `folder-${Date.now()}`,
        title: newFolderName.trim() || "Untitled folder",
        status
      };
      const nextCourse: Course = {
        ...course,
        folders: [...folders, newFolder]
      };
      updateCourse(nextCourse);
    }

    setIsFolderModalOpen(false);
    setNewFolderName("");
    setNewFolderPublished(true);
    setEditingFolderId(null);
  }

  if (viewMode === "grid") {
    return (
      <div className="admin-course-grid-page">
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Courses</span>
          </div>
        </div>
        <div className="panel-body">
          {props.courses.length === 0 ? (
            <div className="panel-empty">No courses yet.</div>
          ) : (
            <>
              <div className="training-card-grid">
                {visibleCourses.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    className="training-card admin-course-card"
                    onClick={() => {
                      setSelectedCourseId(course.id);
                      setViewMode("detail");
                      setDetailSection("overview");
                    }}
                  >
                    <div
                      className="training-card-image"
                      style={
                        course.coverImageUrl
                          ? {
                              backgroundImage: `url(${course.coverImageUrl})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center"
                            }
                          : undefined
                      }
                    >
                      <div className="training-card-image-overlay">
                        {course.tagline && (
                          <span className="training-card-chip">
                            {course.tagline}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="training-card-body">
                      <div className="training-card-title">
                        {course.title}
                      </div>
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  className="admin-course-card-new"
                  onClick={() => {
                    createCourse();
                  }}
                >
                  <div className="admin-course-card-new-icon">+</div>
                  <div>New course</div>
                </button>
              </div>
              {totalPages > 1 && (
                <div className="admin-course-pagination">
                  <button
                    type="button"
                    className="admin-course-page-button"
                    disabled={safePage === 1}
                    onClick={() => setPage(Math.max(1, safePage - 1))}
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }).map((_, index) => {
                    const pageNumber = index + 1;
                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        className={
                          pageNumber === safePage
                            ? "admin-course-page-button admin-course-page-button-active"
                            : "admin-course-page-button"
                        }
                        onClick={() => setPage(pageNumber)}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="admin-course-page-button"
                    disabled={safePage === totalPages}
                    onClick={() =>
                      setPage(
                        Math.min(
                          totalPages,
                          safePage + 1
                        )
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-course-management">
      {isFolderModalOpen && selectedCourse && (
        <div className="overlay">
          <div className="dialog">
            <div className="dialog-title">
              {editingFolderId ? "Edit folder" : "Add folder"}
            </div>
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="field-input"
                value={newFolderName}
                maxLength={50}
                onChange={(event) => setNewFolderName(event.target.value)}
              />
              <div className="field-helper">
                {newFolderName.length} / 50
              </div>
            </label>
            <div className="dialog-footer">
              <button
                type="button"
                className={
                  newFolderPublished
                    ? "status-toggle status-toggle-on dialog-publish-toggle"
                    : "status-toggle dialog-publish-toggle"
                }
                onClick={() => setNewFolderPublished(!newFolderPublished)}
              >
                <span
                  className={
                    newFolderPublished
                      ? "status-toggle-label status-toggle-label-on"
                      : "status-toggle-label"
                  }
                >
                  Published
                </span>
                <span className="status-toggle-track">
                  <span className="status-toggle-thumb" />
                </span>
              </button>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn-secondary btn-cancel"
                  onClick={() => {
                    setIsFolderModalOpen(false);
                    setNewFolderName("");
                    setNewFolderPublished(true);
                    setEditingFolderId(null);
                  }}
                >
                  Cancel
                </button>
                  <button
                    type="button"
                    className="btn-primary btn-success"
                    disabled={!newFolderName.trim()}
                    onClick={() => addFolderForCourse(selectedCourse)}
                  >
                  {editingFolderId ? "Save" : "Add"}
                  </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isLinkModalOpen && selectedCourse && (() => {
        const course = selectedCourse as Course;
        const pages = course.pages ?? [];
        const activePage =
          (activePageId
            ? pages.find((page) => page.id === activePageId)
            : undefined) ??
          (pages.length > 0 ? pages[pages.length - 1] : undefined) ??
          undefined;
        if (!activePage) {
          return null;
        }
        const pageForLink = activePage as CoursePage;
        function handleAddLink() {
          const label = linkLabelDraft.trim();
          const href = linkUrlDraft.trim();
          if (!label || !href) {
            return;
          }
          const nextPages = pages.map((page) =>
            page.id === pageForLink.id
              ? {
                  ...page,
                  resourceLinks: [
                    ...page.resourceLinks,
                    {
                      label,
                      href
                    }
                  ]
                }
              : page
          );
          updateCourse({ ...(course as Course), pages: nextPages });
          setIsLinkModalOpen(false);
        }
        return (
          <div className="overlay">
            <div className="dialog">
              <div className="dialog-title">Add link</div>
              <label className="field">
                <span className="field-label">Label</span>
                <input
                  className="field-input"
                  value={linkLabelDraft}
                  maxLength={34}
                  onChange={(event) => setLinkLabelDraft(event.target.value)}
                  placeholder="Label"
                />
              </label>
              <label className="field" style={{ marginTop: 12 }}>
                <span className="field-label">URL</span>
                <input
                  className="field-input"
                  value={linkUrlDraft}
                  onChange={(event) => setLinkUrlDraft(event.target.value)}
                  placeholder="https://"
                />
              </label>
              <div className="dialog-footer">
                <div />
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-cancel"
                    onClick={() => setIsLinkModalOpen(false)}
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    className="btn-primary btn-success"
                    disabled={!linkLabelDraft.trim() || !linkUrlDraft.trim()}
                    onClick={handleAddLink}
                  >
                    ADD
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {isVideoModalOpen && selectedCourse && (() => {
        const course = selectedCourse as Course;
        const pages = course.pages ?? [];
        const activePage =
          (activePageId
            ? pages.find((page) => page.id === activePageId)
            : undefined) ??
          (pages.length > 0 ? pages[pages.length - 1] : undefined) ??
          undefined;
        if (!activePage) {
          return null;
        }
        const pageForVideo = activePage as CoursePage;
        function handleAddVideo() {
          const trimmed = videoUrlDraft.trim();
          if (!trimmed) {
            return;
          }
          const nextPages = pages.map((page) =>
            page.id === pageForVideo.id
              ? {
                  ...page,
                  videoUrl: trimmed
                }
              : page
          );
          updateCourse({ ...(course as Course), pages: nextPages });
          setIsVideoModalOpen(false);
        }
        return (
          <div className="overlay">
            <div className="dialog">
              <div className="dialog-title">Add a video</div>
              <label className="field">
                <span className="field-label">
                  YouTube, Loom, Vimeo, or Wistia link
                </span>
                <input
                  className="field-input"
                  value={videoUrlDraft}
                  onChange={(event) => setVideoUrlDraft(event.target.value)}
                  placeholder="https://"
                />
              </label>
              <div className="video-dropzone">
                <div className="video-dropzone-icon">⬆</div>
                <div className="video-dropzone-text-main">
                  Drag and drop video here
                </div>
                <div className="video-dropzone-text-sub">or select file</div>
              </div>
              <div className="dialog-footer">
                <div />
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-cancel"
                    onClick={() => setIsVideoModalOpen(false)}
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    className="btn-primary btn-success"
                    disabled={!videoUrlDraft.trim()}
                    onClick={handleAddVideo}
                  >
                    ADD
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      <div className="panel panel-right">
        {selectedCourse ? (
          <div className="panel-scroll">
            <div className="panel-header">
              <div className="panel-header-row">
                <span>Course Details</span>
                <div className="panel-header-actions">
                  <button
                    type="button"
                    className="btn-ghost btn-small"
                    onClick={() => setViewMode("grid")}
                  >
                    Back to courses
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-danger"
                    onClick={() => deleteCourse(selectedCourse.id)}
                  >
                    Delete Course
                  </button>
                </div>
              </div>
            </div>
            <div className="panel-body">
              {detailSection === "overview" ? (
                <>
                  <label className="field">
                    <span className="field-label">Course Title</span>
                    <input
                      className="field-input"
                      value={selectedCourse.title}
                      onChange={(e) =>
                        updateCourse({
                          ...selectedCourse,
                          title: e.target.value
                        })
                      }
                    />
                  </label>
                  <div className="course-cover-editor">
                    <div
                      className="course-cover-preview"
                      style={
                        selectedCourse.coverImageUrl
                          ? {
                              backgroundImage: `url(${selectedCourse.coverImageUrl})`
                            }
                          : undefined
                      }
                    >
                      {!selectedCourse.coverImageUrl && (
                        <button
                          type="button"
                          className="course-cover-upload-button"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Upload
                        </button>
                      )}
                    </div>
                    <div className="course-cover-meta">
                      <div className="course-cover-meta-title">Cover</div>
                      <div className="course-cover-meta-subtitle">
                        1460 x 752 px
                      </div>
                      {selectedCourse.coverImageUrl && (
                        <button
                          type="button"
                          className="btn-secondary btn-small course-cover-change-button"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Change
                        </button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }
                        const previewUrl = URL.createObjectURL(file);
                        updateCourse({
                          ...selectedCourse,
                          coverImageUrl: previewUrl
                        });
                      }}
                    />
                  </div>
                  <label className="field course-description-field">
                    <span className="field-label">Description</span>
                    <textarea
                      className="field-input"
                      rows={6}
                      value={selectedCourse.description}
                      onChange={(e) =>
                        updateCourse({
                          ...selectedCourse,
                          description: e.target.value
                        })
                      }
                    />
                  </label>
                  <div className="form-grid">
                    <label className="field field-course-status">
                      <span className="field-label">Course Status</span>
                      <button
                        type="button"
                        className={
                          selectedCourse.status === "published"
                            ? "status-toggle status-toggle-on"
                            : "status-toggle"
                        }
                        onClick={() =>
                          updateCourse({
                            ...selectedCourse,
                            status:
                              (selectedCourse.status ?? "draft") ===
                              "published"
                                ? "draft"
                                : "published"
                          })
                        }
                      >
                        <span
                          className={
                            selectedCourse.status === "published"
                              ? "status-toggle-label status-toggle-label-on"
                              : "status-toggle-label"
                          }
                        >
                          {selectedCourse.status === "published"
                            ? "Published"
                            : "Draft"}
                        </span>
                        <span className="status-toggle-track">
                          <span className="status-toggle-thumb" />
                        </span>
                      </button>
                    </label>
                    <label className="field">
                      <span className="field-label">Access</span>
                      <select
                        className="field-input"
                        value={selectedCourse.accessMode ?? "open"}
                        onChange={(e) =>
                          updateCourse({
                            ...selectedCourse,
                            accessMode: e.target.value as "open" | "assigned"
                          })
                        }
                      >
                        <option value="open">Open to all members</option>
                        <option value="assigned">
                          Assigned only (manager controls access)
                        </option>
                      </select>
                    </label>
                  </div>
                  <div className="course-actions">
                    <button
                      type="button"
                      className="btn-secondary btn-cancel"
                      onClick={() => setViewMode("grid")}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary btn-success"
                      onClick={() => addPageForCourse(selectedCourse)}
                    >
                      Add
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="course-pages-course-header">
                    <div className="course-pages-course-header-row">
                      <div className="course-pages-course-title">
                        {selectedCourse.title}
                      </div>
                      <div className="course-pages-course-header-right">
                        <button
                          type="button"
                          className="course-page-menu-trigger course-pages-course-menu-trigger"
                          onClick={() => {
                            setIsCourseMenuOpen(!isCourseMenuOpen);
                            setOpenPageMenuId(null);
                          }}
                        >
                          ⋯
                        </button>
                        {isCourseMenuOpen && (
                          <div className="course-page-menu">
                            <button
                              type="button"
                              className="course-page-menu-item"
                              onClick={() => addPageForCourse(selectedCourse)}
                            >
                              Add page
                            </button>
                            <button
                              type="button"
                              className="course-page-menu-item"
                          onClick={() => {
                            setIsFolderModalOpen(true);
                            setIsCourseMenuOpen(false);
                            setNewFolderName("");
                            setNewFolderPublished(true);
                          }}
                            >
                              Add folder
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="course-pages-course-progress">
                      <div className="course-pages-course-progress-label">
                        0%
                      </div>
                      <div className="course-pages-course-progress-track">
                        <div className="course-pages-course-progress-fill" />
                      </div>
                    </div>
                  </div>
                  <div className="course-pages-layout">
                    {(!selectedCourse.pages ||
                      selectedCourse.pages.length === 0) &&
                    (!selectedCourse.folders ||
                      selectedCourse.folders.length === 0) ? (
                      <div className="panel-empty">No pages yet.</div>
                    ) : (
                      <>
                        {(() => {
                          const pages = selectedCourse.pages ?? [];
                          const folders = selectedCourse.folders ?? [];
                          const activePage =
                            pages.find((page) => page.id === activePageId) ??
                            pages[pages.length - 1] ??
                            pages[0];
                          function applyFormatting(
                            kind:
                              | "h1"
                              | "h2"
                              | "h3"
                              | "h4"
                              | "bold"
                              | "italic"
                              | "strike"
                              | "code"
                              | "ul"
                              | "ol"
                              | "quote"
                          ) {
                            if (!activePage) {
                              return;
                            }
                            const textarea = bodyInputRef.current;
                            if (!textarea) {
                              return;
                            }
                            const value = textarea.value;
                            const start = textarea.selectionStart ?? 0;
                            const end = textarea.selectionEnd ?? start;
                            const selected = value.slice(start, end);
                            let replacement = selected;
                            if (kind === "h1") {
                              replacement = selected
                                ? `# ${selected}`
                                : "# ";
                            } else if (kind === "h2") {
                              replacement = selected
                                ? `## ${selected}`
                                : "## ";
                            } else if (kind === "h3") {
                              replacement = selected
                                ? `### ${selected}`
                                : "### ";
                            } else if (kind === "h4") {
                              replacement = selected
                                ? `#### ${selected}`
                                : "#### ";
                            } else if (kind === "bold") {
                              replacement = selected
                                ? `**${selected}**`
                                : "**bold text**";
                            } else if (kind === "italic") {
                              replacement = selected
                                ? `_${selected}_`
                                : "_italic text_";
                            } else if (kind === "strike") {
                              replacement = selected
                                ? `~~${selected}~~`
                                : "~~text~~";
                            } else if (kind === "code") {
                              replacement = selected
                                ? `\`${selected}\``
                                : "`code`";
                            } else if (kind === "ul") {
                              const block = selected || "List item";
                              replacement = block
                                .split("\n")
                                .map((line) =>
                                  line ? `- ${line}` : "- "
                                )
                                .join("\n");
                            } else if (kind === "ol") {
                              const block = selected || "List item";
                              let index = 1;
                              replacement = block
                                .split("\n")
                                .map((line) => {
                                  const text = line || "Item";
                                  const current = `${index}. ${text}`;
                                  index += 1;
                                  return current;
                                })
                                .join("\n");
                            } else if (kind === "quote") {
                              const block = selected || "Quote";
                              replacement = block
                                .split("\n")
                                .map((line) =>
                                  line ? `> ${line}` : "> "
                                )
                                .join("\n");
                            }
                            const nextBody =
                              value.slice(0, start) +
                              replacement +
                              value.slice(end);
                            const nextPages = pages.map((page) =>
                              page.id === activePage.id
                                ? {
                                    ...page,
                                    body: nextBody
                                  }
                                : page
                            );
                            updateCourse({
                              ...(selectedCourse as Course),
                              pages: nextPages
                            });
                          }
                          return (
                            <>
                              <div className="course-pages-sidebar">
                                {pages
                                  .filter((page) => !page.folderId)
                                  .map((page) => (
                                    <div
                                      key={page.id}
                                      className={
                                        activePage &&
                                        page.id === activePage.id
                                          ? "course-pages-item active"
                                          : "course-pages-item"
                                      }
                                      onClick={() => {
                                        setActivePageId(page.id);
                                        setOpenPageMenuId(null);
                                        setIsCourseMenuOpen(false);
                                      }}
                                    >
                                      <span className="course-pages-item-title">
                                        {page.title}
                                      </span>
                                      <button
                                        type="button"
                                        className="course-page-menu-trigger"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setOpenPageMenuId(
                                            openPageMenuId === page.id
                                              ? null
                                              : page.id
                                          );
                                          setIsCourseMenuOpen(false);
                                        }}
                                      >
                                        ⋯
                                      </button>
                                      {openPageMenuId === page.id && (
                                        <div className="course-page-menu">
                                          <button
                                            type="button"
                                            className="course-page-menu-item"
                                            onClick={() => {
                                              setActivePageId(page.id);
                                              setOpenPageMenuId(null);
                                            }}
                                          >
                                            Edit page
                                          </button>
                                          <button
                                            type="button"
                                            className="course-page-menu-item"
                                            onClick={() => {
                                              const nextPages = pages.map(
                                                (p) =>
                                                  p.id === page.id
                                                    ? {
                                                        ...p,
                                                        status:
                                                          "draft" as CoursePage["status"]
                                                      }
                                                    : p
                                              );
                                              updateCourse({
                                                ...selectedCourse,
                                                pages: nextPages
                                              });
                                              setOpenPageMenuId(null);
                                            }}
                                          >
                                            Revert to draft
                                          </button>
                                          <button
                                            type="button"
                                            className="course-page-menu-item"
                                            onClick={() => {
                                              setOpenPageMenuId(null);
                                            }}
                                          >
                                            Change folder
                                          </button>
                                          <button
                                            type="button"
                                            className="course-page-menu-item"
                                            onClick={() => {
                                              const sourcePage = pages.find(
                                                (p) => p.id === page.id
                                              );
                                              if (!sourcePage) {
                                                return;
                                              }
                                              const duplicatePage: CoursePage =
                                                {
                                                  ...sourcePage,
                                                  id: `page-${Date.now()}-copy`,
                                                  title: `${sourcePage.title} copy`
                                                };
                                              const nextPages = [
                                                ...pages,
                                                duplicatePage
                                              ];
                                              updateCourse({
                                                ...selectedCourse,
                                                pages: nextPages
                                              });
                                              setActivePageId(
                                                duplicatePage.id
                                              );
                                              setOpenPageMenuId(null);
                                            }}
                                          >
                                            Duplicate
                                          </button>
                                          <div className="course-page-menu-item course-page-menu-item-muted">
                                            Drip status: Off
                                          </div>
                                          <button
                                            type="button"
                                            className="course-page-menu-item course-page-menu-item-danger"
                                            onClick={() => {
                                              const nextPages = pages.filter(
                                                (p) => p.id !== page.id
                                              );
                                              updateCourse({
                                                ...selectedCourse,
                                                pages: nextPages
                                              });
                                              setOpenPageMenuId(null);
                                              if (activePageId === page.id) {
                                                const fallback =
                                                  nextPages[
                                                    nextPages.length - 1
                                                  ] ?? nextPages[0];
                                                setActivePageId(
                                                  fallback
                                                    ? fallback.id
                                                    : null
                                                );
                                              }
                                            }}
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                {folders.map((folder) => {
                                  const folderPages = pages.filter(
                                    (page) => page.folderId === folder.id
                                  );
                                  return (
                                    <div
                                      key={folder.id}
                                      className="course-folder-group"
                                    >
                                      <div className="course-folder-item">
                                        <button
                                          type="button"
                                          className="course-folder-toggle"
                                        >
                                          ˅
                                        </button>
                                        <span className="course-folder-title">
                                          {folder.status === "draft"
                                            ? `(Draft) ${folder.title}`
                                            : folder.title}
                                        </span>
                                        <button
                                          type="button"
                                          className="course-page-menu-trigger"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setOpenFolderMenuId(
                                              openFolderMenuId === folder.id
                                                ? null
                                                : folder.id
                                            );
                                            setOpenPageMenuId(null);
                                            setIsCourseMenuOpen(false);
                                          }}
                                        >
                                          ⋯
                                        </button>
                                        {openFolderMenuId === folder.id && (
                                          <div className="course-page-menu">
                                            <button
                                              type="button"
                                              className="course-page-menu-item"
                                              onClick={() => {
                                                setEditingFolderId(folder.id);
                                                setNewFolderName(folder.title);
                                                setNewFolderPublished(
                                                  folder.status === "published"
                                                );
                                                setIsFolderModalOpen(true);
                                                setOpenFolderMenuId(null);
                                              }}
                                            >
                                              Edit folder
                                            </button>
                                            <button
                                              type="button"
                                              className="course-page-menu-item"
                                              onClick={() => {
                                                addPageForCourse(
                                                  selectedCourse,
                                                  folder.id
                                                );
                                                setOpenFolderMenuId(null);
                                              }}
                                            >
                                              Add page in folder
                                            </button>
                                            <button
                                              type="button"
                                              className="course-page-menu-item"
                                              onClick={() => {
                                                const now = Date.now();
                                                const folderPagesInner =
                                                  pages.filter(
                                                    (page) =>
                                                      page.folderId ===
                                                      folder.id
                                                  );
                                                const duplicatedFolder: CourseFolder =
                                                  {
                                                    ...folder,
                                                    id: `folder-${now}-copy`,
                                                    title: `${folder.title} copy`
                                                  };
                                                const duplicatedPages =
                                                  folderPagesInner.map(
                                                    (page, index) => ({
                                                      ...page,
                                                      id: `page-${now}-copy-${index}`,
                                                      title: `${page.title} copy`,
                                                      folderId:
                                                        duplicatedFolder.id
                                                    })
                                                  );
                                                const nextCourse: Course = {
                                                  ...selectedCourse,
                                                  folders: [
                                                    ...folders,
                                                    duplicatedFolder
                                                  ],
                                                  pages: [
                                                    ...pages,
                                                    ...duplicatedPages
                                                  ]
                                                };
                                                updateCourse(nextCourse);
                                                setOpenFolderMenuId(null);
                                              }}
                                            >
                                              Duplicate folder
                                            </button>
                                            <button
                                              type="button"
                                              className="course-page-menu-item course-page-menu-item-danger"
                                              onClick={() => {
                                                const remainingFolders =
                                                  folders.filter(
                                                    (item) =>
                                                      item.id !== folder.id
                                                  );
                                                const remainingPages =
                                                  pages.filter(
                                                    (page) =>
                                                      page.folderId !==
                                                      folder.id
                                                  );
                                                const nextCourse: Course = {
                                                  ...selectedCourse,
                                                  folders: remainingFolders,
                                                  pages: remainingPages
                                                };
                                                updateCourse(nextCourse);
                                                setOpenFolderMenuId(null);
                                                if (
                                                  activePageId &&
                                                  !remainingPages.some(
                                                    (page) =>
                                                      page.id === activePageId
                                                  )
                                                ) {
                                                  const fallback =
                                                    remainingPages[
                                                      remainingPages.length - 1
                                                    ] ?? remainingPages[0];
                                                  setActivePageId(
                                                    fallback
                                                      ? fallback.id
                                                      : null
                                                  );
                                                }
                                              }}
                                            >
                                              Delete folder
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                      {folderPages.map((page) => (
                                        <div
                                          key={page.id}
                                          className={
                                            activePage &&
                                            page.id === activePage.id
                                              ? "course-pages-item course-pages-item-child active"
                                              : "course-pages-item course-pages-item-child"
                                          }
                                          onClick={() => {
                                            setActivePageId(page.id);
                                            setOpenPageMenuId(null);
                                            setIsCourseMenuOpen(false);
                                          }}
                                        >
                                          <span className="course-pages-item-title">
                                            {page.title}
                                          </span>
                                          <button
                                            type="button"
                                            className="course-page-menu-trigger"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setOpenPageMenuId(
                                                openPageMenuId === page.id
                                                  ? null
                                                  : page.id
                                              );
                                              setIsCourseMenuOpen(false);
                                            }}
                                          >
                                            ⋯
                                          </button>
                                          {openPageMenuId === page.id && (
                                            <div className="course-page-menu">
                                              <button
                                                type="button"
                                                className="course-page-menu-item"
                                                onClick={() => {
                                                  setActivePageId(page.id);
                                                  setOpenPageMenuId(null);
                                                }}
                                              >
                                                Edit page
                                              </button>
                                              <button
                                                type="button"
                                                className="course-page-menu-item"
                                                onClick={() => {
                                                  const nextPages = pages.map(
                                                    (p) =>
                                                      p.id === page.id
                                                        ? {
                                                            ...p,
                                                            status:
                                                              "draft" as CoursePage["status"]
                                                          }
                                                        : p
                                                  );
                                                  updateCourse({
                                                    ...selectedCourse,
                                                    pages: nextPages
                                                  });
                                                  setOpenPageMenuId(null);
                                                }}
                                              >
                                                Revert to draft
                                              </button>
                                              <button
                                                type="button"
                                                className="course-page-menu-item"
                                                onClick={() => {
                                                  setOpenPageMenuId(null);
                                                }}
                                              >
                                                Change folder
                                              </button>
                                              <button
                                                type="button"
                                                className="course-page-menu-item"
                                                onClick={() => {
                                                  const sourcePage =
                                                    pages.find(
                                                      (p) => p.id === page.id
                                                    );
                                                  if (!sourcePage) {
                                                    return;
                                                  }
                                                  const duplicatePage: CoursePage =
                                                    {
                                                      ...sourcePage,
                                                      id: `page-${Date.now()}-copy`,
                                                      title: `${sourcePage.title} copy`
                                                    };
                                                  const nextPages = [
                                                    ...pages,
                                                    duplicatePage
                                                  ];
                                                  updateCourse({
                                                    ...selectedCourse,
                                                    pages: nextPages
                                                  });
                                                  setActivePageId(
                                                    duplicatePage.id
                                                  );
                                                  setOpenPageMenuId(null);
                                                }}
                                              >
                                                Duplicate
                                              </button>
                                              <div className="course-page-menu-item course-page-menu-item-muted">
                                                Drip status: Off
                                              </div>
                                              <button
                                                type="button"
                                                className="course-page-menu-item course-page-menu-item-danger"
                                                onClick={() => {
                                                  const nextPages =
                                                    pages.filter(
                                                      (p) => p.id !== page.id
                                                    );
                                                  updateCourse({
                                                    ...selectedCourse,
                                                    pages: nextPages
                                                  });
                                                  setOpenPageMenuId(null);
                                                  if (
                                                    activePageId === page.id
                                                  ) {
                                                    const fallback =
                                                      nextPages[
                                                        nextPages.length - 1
                                                      ] ?? nextPages[0];
                                                    setActivePageId(
                                                      fallback
                                                        ? fallback.id
                                                        : null
                                                    );
                                                  }
                                                }}
                                              >
                                                Delete
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="course-page-main">
                                {activePage && (
                                  <>
                                    <div className="course-page-main-header">
                                      <div className="course-page-toolbar">
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button"
                                          onClick={() => applyFormatting("h1")}
                                        >
                                          H1
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button"
                                          onClick={() => applyFormatting("h2")}
                                        >
                                          H2
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button"
                                          onClick={() => applyFormatting("h3")}
                                        >
                                          H3
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button"
                                          onClick={() => applyFormatting("h4")}
                                        >
                                          H4
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button course-page-toolbar-button-bold"
                                          onClick={() => applyFormatting("bold")}
                                        >
                                          B
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button"
                                          onClick={() => applyFormatting("italic")}
                                        >
                                          I
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button"
                                          onClick={() => applyFormatting("strike")}
                                        >
                                          S
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button course-page-toolbar-button-icon"
                                          onClick={() => applyFormatting("code")}
                                        >
                                          {"</>"}
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button course-page-toolbar-button-icon"
                                          onClick={() => applyFormatting("ul")}
                                        >
                                          •
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button course-page-toolbar-button-icon"
                                          onClick={() => applyFormatting("ol")}
                                        >
                                          1.
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button course-page-toolbar-button-icon"
                                          onClick={() => applyFormatting("quote")}
                                        >
                                          "
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button course-page-toolbar-button-icon"
                                        >
                                          🖼
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button course-page-toolbar-button-icon"
                                        >
                                          🔗
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-toolbar-button course-page-toolbar-button-icon course-page-toolbar-button-video"
                                          onClick={() => {
                                            setVideoUrlDraft(
                                              activePage.videoUrl ?? ""
                                            );
                                            setIsVideoModalOpen(true);
                                          }}
                                        >
                                          ▶
                                        </button>
                                      </div>
                                      <input
                                        className="course-page-title-input"
                                        value={activePage.title}
                                        onChange={(event) => {
                                          const nextPages = pages.map((page) =>
                                            page.id === activePage.id
                                              ? {
                                                  ...page,
                                                  title: event.target.value
                                                }
                                              : page
                                          );
                                          updateCourse({
                                            ...selectedCourse,
                                            pages: nextPages
                                          });
                                        }}
                                      />
                                    </div>
                                    <div className="course-page-editor-body">
                                      <textarea
                                        ref={bodyInputRef}
                                        className="course-page-body-input"
                                        rows={10}
                                        value={activePage.body}
                                        placeholder="Start writing your content for this page."
                                        onChange={(event) => {
                                          const nextPages = pages.map((page) =>
                                            page.id === activePage.id
                                              ? {
                                                  ...page,
                                                  body: event.target.value
                                                }
                                              : page
                                          );
                                          updateCourse({
                                            ...selectedCourse,
                                            pages: nextPages
                                          });
                                        }}
                                      />
                                    </div>
                                    <div className="course-page-footer">
                                      <div className="course-page-add">
                                        <button
                                          type="button"
                                          className="course-page-add-button"
                                          onClick={() =>
                                            setIsAddMenuOpen(!isAddMenuOpen)
                                          }
                                        >
                                          <span>ADD</span>
                                          <span className="course-page-add-chevron">
                                            {isAddMenuOpen ? "˄" : "˅"}
                                          </span>
                                        </button>
                                        {isAddMenuOpen && (
                                          <div className="course-page-add-menu">
                                            <button
                                              type="button"
                                              className="course-page-menu-item"
                                              onClick={() => {
                                                setLinkLabelDraft("");
                                                setLinkUrlDraft("");
                                                setIsLinkModalOpen(true);
                                                setIsAddMenuOpen(false);
                                              }}
                                            >
                                              Add resource link
                                            </button>
                                            <button
                                              type="button"
                                              className="course-page-menu-item"
                                              onClick={() => {
                                                const nextPages = pages.map(
                                                  (page) =>
                                                    page.id === activePage.id
                                                      ? {
                                                          ...page,
                                                          fileUrls: [
                                                            ...page.fileUrls,
                                                            { label: "", href: "" }
                                                          ]
                                                        }
                                                      : page
                                                );
                                                updateCourse({
                                                  ...selectedCourse,
                                                  pages: nextPages
                                                });
                                                setIsAddMenuOpen(false);
                                              }}
                                            >
                                              Add resource file
                                            </button>
                                            <button
                                              type="button"
                                              className="course-page-menu-item"
                                              onClick={() => {
                                                const nextPages = pages.map(
                                                  (page) =>
                                                    page.id === activePage.id
                                                      ? {
                                                          ...page,
                                                          transcript:
                                                            page.transcript ??
                                                            ""
                                                        }
                                                      : page
                                                );
                                                updateCourse({
                                                  ...selectedCourse,
                                                  pages: nextPages
                                                });
                                                setIsAddMenuOpen(false);
                                              }}
                                            >
                                              Add transcript
                                            </button>
                                            <button
                                              type="button"
                                              className="course-page-menu-item"
                                              onClick={() => {
                                                const nextPages = pages.map(
                                                  (page) =>
                                                    page.id === activePage.id
                                                      ? {
                                                          ...page,
                                                          pinnedCommunityPostUrl:
                                                            page.pinnedCommunityPostUrl ??
                                                            ""
                                                        }
                                                      : page
                                                );
                                                updateCourse({
                                                  ...selectedCourse,
                                                  pages: nextPages
                                                });
                                                setIsAddMenuOpen(false);
                                              }}
                                            >
                                              Pin community post
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        className={
                                          activePage.status === "published"
                                            ? "status-toggle status-toggle-on"
                                            : "status-toggle"
                                        }
                                        onClick={() => {
                                          const nextPages = pages.map(
                                            (page) =>
                                              page.id === activePage.id
                                                ? {
                                                    ...page,
                                                    status:
                                                      (page.status ===
                                                      "published"
                                                        ? "draft"
                                                        : "published") as CoursePage["status"]
                                                  }
                                                : page
                                          );
                                          updateCourse({
                                            ...selectedCourse,
                                            pages: nextPages
                                          });
                                        }}
                                      >
                                        <span
                                          className={
                                            activePage.status === "published"
                                              ? "status-toggle-label status-toggle-label-on"
                                              : "status-toggle-label"
                                          }
                                        >
                                          Published
                                        </span>
                                        <span className="status-toggle-track">
                                          <span className="status-toggle-thumb" />
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        className="course-page-footer-button course-page-footer-cancel"
                                      >
                                        CANCEL
                                      </button>
                                      <button
                                        type="button"
                                        className="course-page-footer-button course-page-footer-save"
                                        disabled
                                      >
                                        SAVE
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="panel-empty">
            Select or create a course to edit details.
          </div>
        )}
      </div>
    </div>
  );
}

function WebTemplatesPage(props: {
  users: UserProfile[];
  onUsersChange: (users: UserProfile[]) => void;
}) {
  const salesReps = props.users.filter((user) => user.role === "sales");
  const [editingRepId, setEditingRepId] = useState<string | null>(null);
  const editingRep = editingRepId
    ? props.users.find((u) => u.id === editingRepId) || null
    : null;

  function updateStatus(
    user: UserProfile,
    status: "draft" | "pendingApproval" | "published" | "rejected"
  ) {
    const nextUsers = props.users.map((u) =>
      u.id === user.id
        ? {
            ...u,
            webPage: {
              ...(u.webPage ?? {}),
              status
            }
          }
        : u
    );
    props.onUsersChange(nextUsers);
  }

  function updateEditingRep<K extends keyof UserProfile>(
    key: K,
    value: UserProfile[K]
  ) {
    if (!editingRep) return;
    const nextUsers = props.users.map((u) =>
      u.id === editingRep.id ? { ...u, [key]: value } : u
    );
    props.onUsersChange(nextUsers);
  }

  function saveAndCloseEditor() {
    setEditingRepId(null);
  }

  function getStatusLabel(status?: string) {
    if (!status || status === "draft") {
      return "Pending";
    }
    if (status === "pendingApproval") {
      return "Pending approval";
    }
    if (status === "published") {
      return "Published";
    }
    if (status === "rejected") {
      return "Rejected";
    }
    return status;
  }

  function getStatusClassName(status?: string) {
    if (!status || status === "draft") {
      return "status-pending";
    }
    if (status === "pendingApproval") {
      return "status-pending";
    }
    if (status === "published") {
      return "status-approved";
    }
    if (status === "rejected") {
      return "status-rejected";
    }
    return "status-pending";
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-header-row">
          <span>Rep Web Page Templates</span>
        </div>
      </div>
      <div className="panel-body">
        {salesReps.length === 0 ? (
          <div className="panel-empty">No sales reps yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth: 720
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
                      textAlign: "left"
                    }}
                  >
                    Web Page URL
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "center"
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "right"
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {salesReps.map((rep, index) => {
                  const slug = rep.name
                    .toLowerCase()
                    .replace(/\s+/g, "");
                  const url = `https://www.millerstorm.com/team/${slug}`;
                  const status = rep.webPage?.status ?? "draft";
                  const statusClass = getStatusClassName(status);
                  const statusLabel = getStatusLabel(status);
                  return (
                    <tr
                      key={rep.id}
                      style={{
                        borderTop: index === 0 ? "1px solid #e5e7eb" : "none",
                        borderBottom: "1px solid #e5e7eb"
                      }}
                    >
                      <td
                        style={{
                          padding: "10px 12px",
                          fontSize: 13
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{rep.name}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {rep.email}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontSize: 12
                        }}
                      >
                        {url}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "center"
                        }}
                      >
                        <span className={`status-badge ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right"
                        }}
                      >
                        <button
                          type="button"
                          className="btn-primary btn-success btn-small"
                          style={{ marginLeft: 0 }}
                          onClick={() => updateStatus(rep, "published")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-danger-solid btn-small"
                          style={{ marginLeft: 8 }}
                          onClick={() => updateStatus(rep, "rejected")}
                        >
                          Reject
                        </button>
                  <button
                    type="button"
                    className="btn-secondary btn-dark btn-small"
                    style={{ marginLeft: 8 }}
                    onClick={() => setEditingRepId(rep.id)}
                  >
                    Edit Template
                  </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {editingRep && (
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-header">
              <div className="panel-header-row">
                <span>Edit Web Page Template</span>
                <div style={{ display: "inline-flex", gap: 8 }}>
                  <button
                    className="btn-primary btn-success solid btn-small"
                    type="button"
                    onClick={saveAndCloseEditor}
                  >
                    Save
                  </button>
                  <button
                    className="btn-secondary btn-small"
                    type="button"
                    onClick={() => setEditingRepId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Mission Title</span>
                  <input
                    className="field-input"
                    value={editingRep.missionTitle ?? ""}
                    onChange={(e) =>
                      updateEditingRep("missionTitle", e.target.value)
                    }
                  />
                </label>
              </div>
              <label className="field">
                <span className="field-label">Mission Body</span>
                <textarea
                  className="field-input"
                  rows={4}
                  value={editingRep.missionBody ?? editingRep.bio ?? ""}
                  onChange={(e) =>
                    updateEditingRep("missionBody", e.target.value)
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Web Page Bio</span>
                <textarea
                  className="field-input"
                  rows={4}
                  value={editingRep.bio ?? ""}
                  onChange={(e) => updateEditingRep("bio", e.target.value)}
                />
              </label>
              <div className="form-grid" style={{ marginTop: 8 }}>
                <label className="field">
                  <span className="field-label">Why Us Title</span>
                  <input
                    className="field-input"
                    value={editingRep.whyUsTitle ?? ""}
                    onChange={(e) =>
                      updateEditingRep("whyUsTitle", e.target.value)
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Expert Roofers Title</span>
                  <input
                    className="field-input"
                    value={editingRep.expertRoofersTitle ?? ""}
                    onChange={(e) =>
                      updateEditingRep("expertRoofersTitle", e.target.value)
                    }
                  />
                </label>
              </div>
              <label className="field">
                <span className="field-label">Why Us Body</span>
                <textarea
                  className="field-input"
                  rows={4}
                  value={editingRep.whyUsBody ?? ""}
                  onChange={(e) =>
                    updateEditingRep("whyUsBody", e.target.value)
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Expert Roofers Body</span>
                <textarea
                  className="field-input"
                  rows={4}
                  value={editingRep.expertRoofersBody ?? ""}
                  onChange={(e) =>
                    updateEditingRep("expertRoofersBody", e.target.value)
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Marketing Materials</span>
                <textarea
                  className="field-input"
                  rows={4}
                  value={editingRep.marketingMaterialsNotes ?? ""}
                  onChange={(e) =>
                    updateEditingRep("marketingMaterialsNotes", e.target.value)
                  }
                />
              </label>
              {/* Removed CTA Label and Phone as requested */}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type AppToolItem = {
  id: string;
  title: string;
  imageUrl: string;
  description: string;
  link: string;
};

function AppsToolManagement() {
  const [apps, setApps] = useState<AppToolItem[]>([]);
  const [tools, setTools] = useState<AppToolItem[]>([]);
  const [other, setOther] = useState<AppToolItem[]>([]);
  const [isCreating, setIsCreating] = useState<"apps" | "tools" | "other" | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newLink, setNewLink] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function createItem(type: "apps" | "tools" | "other") {
    if (!newTitle.trim()) return;
    const newItem: AppToolItem = {
      id: `${type}-${Date.now()}`,
      title: newTitle,
      imageUrl: newImageUrl,
      description: newDescription,
      link: newLink
    };
    if (type === "apps") setApps([...apps, newItem]);
    if (type === "tools") setTools([...tools, newItem]);
    if (type === "other") setOther([...other, newItem]);
    setIsCreating(null);
    setNewTitle("");
    setNewImageUrl("");
    setNewDescription("");
    setNewLink("");
  }

  function deleteItem(type: "apps" | "tools" | "other", id: string) {
    if (type === "apps") setApps(apps.filter(item => item.id !== id));
    if (type === "tools") setTools(tools.filter(item => item.id !== id));
    if (type === "other") setOther(other.filter(item => item.id !== id));
  }

  function renderSection(title: string, items: AppToolItem[], type: "apps" | "tools" | "other") {
    return (
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span>{title}</span>
            <button
              type="button"
              className="btn-primary btn-success btn-small"
              onClick={() => setIsCreating(type)}
            >
              + Create {title.slice(0, -1)}
            </button>
          </div>
        </div>
        <div className="panel-body">
          {isCreating === type && (
            <div style={{ borderBottom: "1px solid #e5e7eb", marginBottom: 16, paddingBottom: 16 }}>
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Title</span>
                  <input
                    className="field-input"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Enter title"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Image (400 x 300 px recommended)</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="field-input"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="Image URL"
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Upload
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setNewImageUrl(URL.createObjectURL(file));
                      }}
                    />
                  </div>
                </label>
              </div>
              <label className="field" style={{ marginTop: 16 }}>
                <span className="field-label">Description</span>
                <textarea
                  className="field-input"
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Enter description"
                />
              </label>
              <label className="field" style={{ marginTop: 16 }}>
                <span className="field-label">Link</span>
                <input
                  className="field-input"
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  placeholder="https://"
                />
              </label>
              <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
                <button
                  type="button"
                  className="btn-primary btn-success"
                  onClick={() => createItem(type)}
                >
                  Create
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ color: "#dc2626" }}
                  onClick={() => {
                    setIsCreating(null);
                    setNewTitle("");
                    setNewImageUrl("");
                    setNewDescription("");
                    setNewLink("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {items.length === 0 ? (
            <div className="panel-empty">No {title.toLowerCase()} yet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {items.map((item) => (
                <div key={item.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {item.imageUrl && (
                    <div
                      style={{
                        width: "100%",
                        height: 180,
                        backgroundImage: `url(${item.imageUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center"
                      }}
                    />
                  )}
                  <div style={{ padding: 16 }}>
                    <div className="card-title" style={{ marginBottom: 8 }}>{item.title}</div>
                    <div className="card-description" style={{ marginBottom: 12, fontSize: 13 }}>
                      {item.description}
                    </div>
                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12, color: "#2563eb", wordBreak: "break-all" }}
                      >
                        {item.link}
                      </a>
                    )}
                    <div style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        className="btn-ghost btn-danger btn-small"
                        onClick={() => deleteItem(type, item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {renderSection("Apps", apps, "apps")}
      {renderSection("Tools", tools, "tools")}
      {renderSection("Other", other, "other")}
    </div>
  );
}

function BusinessUnitsManager(props: { users: UserProfile[] }) {
  const managers = props.users.filter((u) => u.role === "manager" || (u.roles || []).includes("manager"));

  function getTeamMembers(managerId: string) {
    return props.users.filter((u) => u.managerId === managerId);
  }

  return (
    <div>
      {managers.length === 0 ? (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-header-row">
              <span>Business Units</span>
            </div>
          </div>
          <div className="panel-body">
            <div className="panel-empty">No managers found.</div>
          </div>
        </div>
      ) : (
        managers.map((manager) => {
          const teamMembers = getTeamMembers(manager.id);
          return (
            <div key={manager.id} className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-header">
                <div className="panel-header-row">
                  <span>{manager.name} - Team Business Plans</span>
                </div>
              </div>
              <div className="panel-body">
                {manager.businessPlan && (
                  <div style={{ marginBottom: 16, padding: 12, backgroundColor: "#f9fafb", borderRadius: 6 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>{manager.name} (Manager)</div>
                    <div className="grid grid-4">
                      <DashboardCard
                        title="Target Revenue"
                        value={`$${((manager.businessPlan as any).targetRevenue || manager.businessPlan.revenueGoal || 0).toLocaleString()}`}
                      />
                      <DashboardCard
                        title="Days to Close"
                        value={((manager.businessPlan as any).daysToClose || manager.businessPlan.daysPerWeek || 0).toString()}
                      />
                    </div>
                  </div>
                )}
                {teamMembers.length === 0 ? (
                  <div className="panel-empty">No team members assigned.</div>
                ) : (
                  teamMembers.map((member) => (
                    <div key={member.id} style={{ marginBottom: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 6 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>{member.name}</div>
                      {member.businessPlan ? (
                        <div className="grid grid-4">
                          <DashboardCard
                            title="Target Revenue"
                            value={`$${((member.businessPlan as any).targetRevenue || member.businessPlan.revenueGoal || 0).toLocaleString()}`}
                          />
                          <DashboardCard
                            title="Days to Close"
                            value={((member.businessPlan as any).daysToClose || member.businessPlan.daysPerWeek || 0).toString()}
                          />
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#6b7280" }}>No business plan set</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function PlaceholderSection(props: { title: string; description: string }) {
  return (
    <div className="placeholder">
      <div className="placeholder-title">{props.title}</div>
      <div className="placeholder-description">{props.description}</div>
    </div>
  );
}

export function AdminPortal(props: AdminPortalProps) {
  const [activeView, setActiveView] = useState<AdminViewId>("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>(props.users);
  const [deletedUsers, setDeletedUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    setUsers(props.users);
  }, [props.users]);

  function handleUsersChange(next: UserProfile[]) {
    setUsers(next);
    props.onUsersChange(next);
  }

  function renderView() {
    if (activeView === "dashboard") {
      return <AdminDashboard users={users} courses={props.courses} />;
    }
    if (activeView === "userManagement") {
      return (
        <UserManagement
          users={users}
          deletedUsers={deletedUsers}
          onUsersChange={handleUsersChange}
          onDeletedUsersChange={setDeletedUsers}
        />
      );
    }
    if (activeView === "aiBots") {
      return <AiBotManagement courses={props.courses} />;
    }
    if (activeView === "salesOverview") {
      return (
        <PlaceholderSection
          title="Sales Team Overview"
          description="Roll-up of sales performance, funnels, and activity. Populate with CRM integrations."
        />
      );
    }
    if (activeView === "marketingOverview") {
      return (
        <PlaceholderSection
          title="Marketing Overview"
          description="Brand campaigns, social metrics, and lead source performance."
        />
      );
    }
    if (activeView === "courseManagement") {
      return (
        <CourseManagement
          courses={props.courses}
          onCoursesChange={props.onCoursesChange}
        />
      );
    }
    if (activeView === "materialsLibrary") {
      return (
        <PlaceholderSection
          title="Marketing Materials Library"
          description="Curate brand-approved decks, one-pagers, and print pieces."
        />
      );
    }
    if (activeView === "approvalWorkflows") {
      return (
        <PlaceholderSection
          title="Approval Workflows"
          description="Configure approval paths for content, web pages, and assets."
        />
      );
    }
    if (activeView === "webTemplates") {
      return (
        <WebTemplatesPage users={users} onUsersChange={handleUsersChange} />
      );
    }
    if (activeView === "businessUnits") {
      return <BusinessUnitsManager users={users} />;
    }
    if (activeView === "roleHierarchy") {
      return (
        <RoleHierarchyManager users={users} onUsersChange={handleUsersChange} />
      );
    }
    if (activeView === "appsTools") {
      return <AppsToolManagement />;
    }
    if (activeView === "webText") {
      return (
        <PlaceholderSection
          title="Web Text Management"
          description="Manage website text content. Navigate to /admin/web-text for full functionality."
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
          header={<div className="sidebar-title">Admin Portal</div>}
          items={sidebarItems}
          activeId={activeView}
          onSelect={(id) => setActiveView(id as AdminViewId)}
          onLogout={props.onLogout}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />
      }
      header={
        <Header
          title="Sales & Marketing Operating System"
          subtitle="Enterprise control center"
          userName={props.currentUser.name}
          roleLabel="Admin"
          onLogout={props.onLogout}
        />
      }
    >
      {renderView()}
    </Layout>
  );
}
