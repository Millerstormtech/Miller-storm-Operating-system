import { useEffect, useRef, useState } from "react";
import { appConfirm } from "../../lib/appDialogs";
import { UserProfile, FeatureToggles } from "../../types";
import { isQuizResultPassing } from "../../lib/quiz";
import { WebPagePreview as SalesWebPagePreview } from "../SalesPortal";

type UserRole = "admin" | "manager" | "sales" | "marketing" | "c-level";

type UserEditorProps = {
  users: UserProfile[];
  deletedUsers: UserProfile[];
  onUsersChange: (users: UserProfile[]) => void;
  onDeletedUsersChange: (users: UserProfile[]) => void;
};

export function UserManagement(props: UserEditorProps) {
  const [draftUsers, setDraftUsers] = useState<UserProfile[]>(props.users);
  const [draftDeletedUsers, setDraftDeletedUsers] = useState<UserProfile[]>(props.deletedUsers);
  
  // Update from props only when NOT dirty (no unsaved changes)
  useEffect(() => {
    if (!isDirty) setDraftUsers(props.users);
  }, [props.users]);
  
  useEffect(() => {
    if (!isDirty) setDraftDeletedUsers(props.deletedUsers);
  }, [props.deletedUsers]);
  const [notifyUsers, setNotifyUsers] = useState<Record<string, boolean>>({});
  const [notifyUsersBySMS, setNotifyUsersBySMS] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const saveNoticeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showWebPreview, setShowWebPreview] = useState(false);
  const [showRolesDropdown, setShowRolesDropdown] = useState(false);
  const [managerDraftId, setManagerDraftId] = useState<string>(props.users.find((u) => u.id === selectedUserId)?.managerId ?? "");
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [managerError, setManagerError] = useState("");
  const emailInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [pendingImportUsers, setPendingImportUsers] = useState<any[]>([]);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [notifyingUpdate, setNotifyingUpdate] = useState(false);
  const [showActiveUsers, setShowActiveUsers] = useState(true);
  const [showSuspendedUsers, setShowSuspendedUsers] = useState(true);
  const [showDeletedUsers, setShowDeletedUsers] = useState(true);
  const [sortBy, setSortBy] = useState<"nameAsc" | "nameDesc" | "newest" | "oldest" | "lastModified">("nameAsc");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "manager" | "sales" | "marketing" | "c-level">("all");
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showDeveloperModal, setShowDeveloperModal] = useState(false);
  const [devSearch, setDevSearch] = useState("");
  const [developerModalTab, setDeveloperModalTab] = useState<"selection" | "selected">("selection");
  const [developerUsers, setDeveloperUsers] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("developerUsers");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [showFeatureToggles, setShowFeatureToggles] = useState(false);
  const [showTrainingProgress, setShowTrainingProgress] = useState(false);
  const [showAssignedSales, setShowAssignedSales] = useState(false);
  const [assignedSalesUsers, setAssignedSalesUsers] = useState<any[]>([]);
  const [trainingModalData, setTrainingModalData] = useState<{ course: any; completed: number; total: number; isCompleted: boolean }[]>([]);
  const [isLoadingTrainingModal, setIsLoadingTrainingModal] = useState(false);
  const [activeUsersSearch, setActiveUsersSearch] = useState("");

  function openTrainingProgress(user: UserProfile) {
    setTrainingModalData([]);
    setIsLoadingTrainingModal(true);
    fetch('/api/courses').then(r => r.json()).then(async (courses) => {
      const published = (courses || []).filter((c: any) => c.status === 'published');
      if (!published.length) { setTrainingModalData([]); setIsLoadingTrainingModal(false); return; }
      const courseIds = published.map((c: any) => c.id).join(',');
      const progRes = await fetch(`/api/course-progress?userId=${user.id}&courseIds=${courseIds}`);
      const progData = progRes.ok ? await progRes.json() : {};
      const rows = published.map((course: any) => {
        // Count ALL published items (lessons + quizzes), matching the app.
        const publishedPages = (course.pages || []).filter((p: any) => p.status === 'published');
        const total = publishedPages.length;
        const rec = progData[course.id] || {};
        const completedSet = new Set(rec.completedPages || []);
        const quizResults = rec.quizResults || [];
        const completed = publishedPages.filter((p: any) =>
          p.isQuiz
            ? isQuizResultPassing(quizResults.find((r: any) => r.pageId === p.id))
            : completedSet.has(p.id)
        ).length;
        return { course, completed, total, isCompleted: total > 0 && completed >= total };
      }).filter((r: any) => r.total > 0);
      setTrainingModalData(rows);
    }).catch(console.error).finally(() => setIsLoadingTrainingModal(false));
  }

  const featureToggleKeysByRole: Record<UserProfile["role"], (keyof FeatureToggles)[]> = {
    admin: ["socialMediaMetrics", "businessUnits", "trainingCenter", "userManagement", "courseManagement", "appsTools", "aiBots", "courseAiBots", "messaging", "leaderboard"],
    manager: ["dashboard", "plans", "onlineTraining", "aiChat", "appsTools", "profile", "taskTracker"],
    sales: ["dashboard", "plan", "training", "aiChat", "appsTools", "profile"],
    marketing: ["dashboard", "assets", "approvals", "socialMetrics", "appsTools", "aiAssistant"],
    // C-Level always sees its full fixed feature set (no per-user toggles).
    "c-level": []
  };

  const featureToggleLabels: Record<string, string> = {
    // Admin
    socialMediaMetrics: "Social Media Executive View",
    businessUnits: "Business Planner Executive View",
    trainingCenter: "Course Leaderboard",
    userManagement: "User Management",
    courseManagement: "Course Builder",
    appsTools: "Apps & Tool Builder",
    stormChat: "StormChat",
    aiBots: "Master Bot Builder",
    courseAiBots: "Course Bots Builder",
    messaging: "SMS Config",
    leaderboard: "Zapier Config",
    emailConfig: "Email Config",
    // Manager
    dashboard: "Dashboard",
    plans: "Team Business Planners",
    onlineTraining: "Training Center",
    aiChat: "Jay's AI Clone",
    profile: "My Profile",
    taskTracker: "Task Manager",
    // Sales
    plan: "Business Planner",
    training: "Training Center",
    // Marketing
    assets: "Marketing Assets",
    approvals: "Approval Queue",
    socialMetrics: "Social Metrics",
    aiAssistant: "AI Assistant"
  };

  const selectedUser = draftUsers.find((u) => u.id === selectedUserId);
  
  // Single role selection
  const userRoles = selectedUser ? [selectedUser.role] : [];
  const uniqueRoles = [...new Set(userRoles)];
  
  // Get toggles grouped by role
  const togglesByRole = uniqueRoles.map(role => ({
    role,
    keys: featureToggleKeysByRole[role]
  }));

  const roleLabels: Record<UserRole, string> = {
    admin: "Admin Panel",
    "c-level": "C-Level Panel",
    manager: "Manager Panel",
    sales: "Sales Panel",
    marketing: "Marketing Panel"
  };

  const sortUsers = (users: UserProfile[]) => {
    let filtered = [...users];
    
    // Filter out developer accounts from sidebar
    filtered = filtered.filter(u => !developerUsers.has(u.id));
    
    // Apply role filter
    if (roleFilter !== "all") {
      filtered = filtered.filter(u => u.role === roleFilter);
    }
    
    // Apply sorting
    switch (sortBy) {
      case "nameAsc":
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
      case "nameDesc":
        return filtered.sort((a, b) => b.name.localeCompare(a.name));
      case "newest":
        return filtered.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
      case "oldest":
        return filtered.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return aTime - bTime;
        });
      case "lastModified":
        return filtered.sort((a, b) => {
          const aTime = (a as any).updatedAt ? new Date((a as any).updatedAt).getTime() : 0;
          const bTime = (b as any).updatedAt ? new Date((b as any).updatedAt).getTime() : 0;
          return bTime - aTime;
        });
      default:
        return filtered;
    }
  };

  function toggleDeveloperUser(userId: string) {
    const newSet = new Set(developerUsers);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    setDeveloperUsers(newSet);
    localStorage.setItem("developerUsers", JSON.stringify([...newSet]));
  }

  function saveDeveloperAccounts() {
    setShowDeveloperModal(false);
  }

  useEffect(() => {
    const current = draftUsers.find((u) => u.id === selectedUserId);
    setManagerDraftId(current?.managerId ?? "");
  }, [selectedUserId]); // only reset when user selection changes, not on every draftUsers update

  // Load assigned sales users when manager is selected
  useEffect(() => {
    if (selectedUser?.role === "manager") {
      const salesUsersUnderManager = draftUsers.filter(u => u.managerId === selectedUser.id && u.role === "sales");
      setAssignedSalesUsers(salesUsersUnderManager);
    } else {
      setAssignedSalesUsers([]);
    }
  }, [selectedUser, draftUsers]);

  useEffect(() => {
    setShowWebPreview(false);
  }, [selectedUserId]);

  useEffect(() => {
    if (!isDirty && !props.users.find((u) => u.id === selectedUserId) && props.users.length > 0) {
      const activeUsers = props.users.filter(u => !u.suspended);
      const firstSorted = sortUsers(activeUsers)[0];
      setSelectedUserId(firstSorted?.id ?? props.users[0]?.id ?? "");
    }
  }, [props.users, isDirty, selectedUserId]);

  // On first load, select the first user from the sorted active list
  useEffect(() => {
    if (!selectedUserId && draftUsers.length) {
      const firstSorted = sortUsers(draftUsers.filter(u => !u.suspended))[0];
      setSelectedUserId(firstSorted?.id ?? draftUsers[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftUsers]);

  useEffect(() => {
    if (!draftUsers.length) {
      if (selectedUserId) setSelectedUserId("");
      return;
    }
    if (!draftUsers.find((u) => u.id === selectedUserId)) {
      const firstSorted = sortUsers(draftUsers.filter(u => !u.suspended))[0];
      setSelectedUserId(firstSorted?.id ?? draftUsers[0].id);
    }
  }, [draftUsers, selectedUserId]);

  useEffect(() => {
    return () => {
      if (saveNoticeTimeout.current) clearTimeout(saveNoticeTimeout.current);
    };
  }, []);

  function updateUser(updated: UserProfile) {
    const lowerEmail = updated.email.trim().toLowerCase();
    const nextUser = { ...updated, email: lowerEmail };
    const next = draftUsers.map((u) => (u.id === updated.id ? nextUser : u));
    setDraftUsers(next);
    setIsDirty(true);
  }

  async function checkEmailAvailability(email: string, currentUserId: string) {
    if (!email || email === currentUserId) {
      setEmailError("");
      return;
    }
    try {
      const res = await fetch(`/api/users/check-email?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.exists) {
          setEmailError("This email is already in use");
        } else {
          setEmailError("");
        }
      }
    } catch (error) {
      console.error("Failed to check email:", error);
    }
  }

  function createUser() {
    const allToggles: FeatureToggles = {
      dashboard: true,
      userManagement: true,
      roleHierarchy: true,
      businessUnits: true,
      salesOverview: true,
      marketingOverview: true,
      courseManagement: true,
      materialsLibrary: true,
      approvalWorkflows: true,
      aiBots: true,
      webTemplates: true,
      webText: true,
      appsTools: true,
      socialMediaMetrics: true,
      team: true,
      plans: true,
      training: true,
      onlineTraining: true,
      taskTracker: true,
      profile: true,
      plan: true,
      materials: true,
      aiChat: true,
      webPage: true,
      businessCards: true,
      assets: true,
      approvals: true,
      socialMetrics: true,
      featureToggles: true,
      systemSettings: true,
      teamBusinessPlans: true,
      teamFunnelMetrics: true,
      teamTraining: true,
      aiAssistant: true,
      businessPlan: true,
      trainingCenter: true,
      marketingMaterials: true,
      repWebPage: true,
      assetLibrary: true,
      contentApprovals: true,
      courseAiBots: true,
      messaging: true,
      leaderboard: true
    };
    const newUser: UserProfile = {
      id: `user-${Date.now()}`,
      name: "New User",
      email: "",
      password: "",
      role: "" as any,
      roles: [],
      strengths: "",
      weaknesses: "",
      phone: "",
      territory: "",
      publicProfile: { showHeadshot: true, showEmail: true, showPhone: true, showStrengths: true, showWeaknesses: true, showTerritory: true },
      featureToggles: allToggles
    };
    const next = [...draftUsers, newUser];
    setDraftUsers(next);
    setIsDirty(true);
    setSelectedUserId(newUser.id);
  }

  async function deleteUser(userId: string) {
    const deleted = draftUsers.find((u) => u.id === userId);
    if (!deleted) return;
    
    // Immediately call API to soft delete
    try {
      await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });
      
      // Reload both lists from server
      const [usersRes, deletedRes] = await Promise.all([
        fetch("/api/users?deleted=false"),
        fetch("/api/users?deleted=true")
      ]);
      
      if (usersRes.ok && deletedRes.ok) {
        const activeUsers = await usersRes.json();
        const deletedUsers = await deletedRes.json();
        
        setDraftUsers(activeUsers);
        setDraftDeletedUsers(deletedUsers);
        
        // Notify parent to update
        props.onUsersChange(activeUsers);
        props.onDeletedUsersChange(deletedUsers);
        
        // Update selection
        if (selectedUserId === userId) {
          setSelectedUserId(activeUsers[0]?.id ?? "");
        }
      }
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert('Failed to delete user');
    }
  }

  function updateFeatureToggles(user: UserProfile, toggles: Partial<FeatureToggles>) {
    updateUser({ ...user, featureToggles: { ...user.featureToggles, ...toggles } });
  }

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split("\n").filter(line => line.trim());
      const headers = lines[0].split(",").map(h => h.trim());
      
      const users = lines.slice(1).map(line => {
        const values = line.split(",").map(v => v.trim());
        const user: any = {};
        headers.forEach((header, i) => {
          user[header] = values[i];
        });
        
        // Set default feature toggles based on role
        if (user.role) {
          const roleToggles = featureToggleKeysByRole[user.role as UserRole];
          if (roleToggles) {
            user.featureToggles = {};
            roleToggles.forEach(key => {
              user.featureToggles[key] = true;
            });
          }
        }
        
        return user;
      });

      // Check for duplicate emails
      const emailChecks = await Promise.all(
        users.map(async (user) => {
          try {
            const res = await fetch(`/api/users/check-email?email=${encodeURIComponent(user.email)}`);
            if (res.ok) {
              const data = await res.json();
              return { email: user.email, exists: data.exists };
            }
            return { email: user.email, exists: false };
          } catch {
            return { email: user.email, exists: false };
          }
        })
      );

      const duplicateEmails = emailChecks.filter(check => check.exists).map(check => check.email);
      
      if (duplicateEmails.length > 0) {
        alert(`The following emails already exist:\n${duplicateEmails.join("\n")}\n\nPlease remove them from the CSV and try again.`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setPendingImportUsers(users);
      setShowImportConfirm(true);
    } catch (error) {
      console.error("Import error:", error);
      alert("Failed to parse CSV file");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleExportCSV() {
    const headers = ["id", "name", "email", "role", "phone", "territory"];
    
    const rows = draftUsers.map(user => [
      user.id,
      user.name,
      user.email,
      user.role,
      user.phone || "",
      user.territory || ""
    ]);
    
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadTemplate() {
    // Simple template with only basic user fields
    const headers = ["name", "email", "role", "phone", "territory", "password"];
    
    // Create example rows
    const exampleRows = [
      [
        "John Doe",
        "john.doe@company.com",
        "sales",
        "555-0100",
        "North Territory",
        "password123"
      ],
      [
        "Jane Smith",
        "jane.smith@company.com",
        "manager",
        "555-0101",
        "South Territory",
        "password456"
      ]
    ];
    
    const csv = [headers.join(","), ...exampleRows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "user-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function confirmImport() {
    setImporting(true);
    try {
      const res = await fetch("/api/users/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: pendingImportUsers })
      });

      if (res.ok) {
        const result = await res.json();
        setSaveNotice(`Imported ${result.count} users successfully`);
        if (saveNoticeTimeout.current) clearTimeout(saveNoticeTimeout.current);
        saveNoticeTimeout.current = setTimeout(() => setSaveNotice(""), 3000);
        setShowImportConfirm(false);
        setPendingImportUsers([]);
        window.location.reload();
      } else {
        alert("Failed to import users");
      }
    } catch (error) {
      console.error("Import error:", error);
      alert("Failed to import users");
    } finally {
      setImporting(false);
    }
  }

  // Push a "new version available" notification (mobile push + in-app bell) to
  // every app user. Tapping it opens the App Store / Play Store.
  async function confirmNotifyUpdate() {
    setNotifyingUpdate(true);
    try {
      const res = await fetch("/api/notify-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const result = await res.json();
        setSaveNotice(`Update notification sent to ${result.recipients} user(s) (${result.pushSuccess} push delivered)`);
        if (saveNoticeTimeout.current) clearTimeout(saveNoticeTimeout.current);
        saveNoticeTimeout.current = setTimeout(() => setSaveNotice(""), 4000);
        setShowUpdateConfirm(false);
      } else {
        alert("Failed to send update notification");
      }
    } catch (error) {
      console.error("Notify-update error:", error);
      alert("Failed to send update notification");
    } finally {
      setNotifyingUpdate(false);
    }
  }

  return (
    <div className="admin-user-management">
      <div className="panel-header" style={{ marginBottom: 16 }}>
        <div className="panel-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>User Management</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {(['admin', 'c-level', 'manager', 'sales', 'marketing'] as UserRole[]).map(role => {
                const count = draftUsers.filter(u => u.role === role).length;
                const colors: Record<UserRole, { bg: string; color: string }> = {
                  admin: { bg: '#fef3c7', color: '#92400e' },
                  "c-level": { bg: '#ede9fe', color: '#5b21b6' },
                  manager: { bg: '#dbeafe', color: '#1e40af' },
                  sales: { bg: '#dcfce7', color: '#166534' },
                  marketing: { bg: '#fce7f3', color: '#9d174d' }
                };
                return (
                  <span key={role} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, backgroundColor: colors[role].bg, color: colors[role].color }}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}: {count}
                  </span>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-secondary btn-small" onClick={handleExportCSV}>
              Export CSV
            </button>
            <button type="button" className="btn-secondary btn-small" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? "Importing..." : "Import CSV"}
            </button>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleImportCSV} />
            <button type="button" className="btn-secondary btn-small" onClick={() => setShowUpdateConfirm(true)} disabled={notifyingUpdate}>
              {notifyingUpdate ? "Sending..." : "Notify App Update"}
            </button>
            <button type="button" className="btn-primary btn-success" onClick={createUser}>+ Add User</button>
          </div>
        </div>
      </div>
      <div className="admin-user-management-content">
      {showUpdateConfirm && (
        <div className="overlay">
          <div className="dialog" style={{ width: 460, maxWidth: "90vw" }}>
            <div className="dialog-title">Notify users to update the app</div>
            <div style={{ fontSize: 13, color: "#6b7280", margin: "12px 0 20px", lineHeight: 1.5 }}>
              This sends a push notification and an in-app alert to <strong>all app users</strong> letting
              them know a new version is available. Tapping it opens the App Store (or Play Store on Android).
              Only send this after the new version is live in the store.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn-secondary btn-cancel" onClick={() => setShowUpdateConfirm(false)} disabled={notifyingUpdate}>
                Cancel
              </button>
              <button type="button" className="btn-primary btn-success" onClick={confirmNotifyUpdate} disabled={notifyingUpdate}>
                {notifyingUpdate ? "Sending..." : "Send notification"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showImportConfirm && (
        <div className="overlay">
          <div className="dialog" style={{ width: 600, maxWidth: "90vw" }}>
            <div className="dialog-title">Confirm User Import</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              {pendingImportUsers.length} user(s) will be imported:
            </div>
            <div style={{ maxHeight: 400, overflowY: "auto", marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 8 }}>
              <table style={{ width: "100%", fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  <tr>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600 }}>Name</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600 }}>Email</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600 }}>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingImportUsers.map((user, index) => (
                    <tr key={index} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 12px" }}>{user.name}</td>
                      <td style={{ padding: "8px 12px" }}>{user.email}</td>
                      <td style={{ padding: "8px 12px", textTransform: "capitalize" }}>{user.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="dialog-footer">
              <div />
              <div className="dialog-actions">
                <button type="button" className="btn-secondary btn-cancel" onClick={() => { setShowImportConfirm(false); setPendingImportUsers([]); }} disabled={importing}>
                  Cancel
                </button>
                <button type="button" className="btn-primary btn-success" onClick={confirmImport} disabled={importing}>
                  {importing ? "Importing..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="panel panel-left">
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Users</span>
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
              {/* Role Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14, color: "#6b7280" }}>Role:</span>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    {roleFilter === "all" ? "All" : roleFilter.charAt(0).toUpperCase() + roleFilter.slice(1)}
                    <span style={{ fontSize: 12 }}>▼</span>
                  </button>
                  {showRoleDropdown && (
                    <div style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      marginTop: 4,
                      backgroundColor: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                      zIndex: 1000,
                      minWidth: 160
                    }}>
                      {[
                        { value: "all", label: "All Roles" },
                        { value: "admin", label: "Admin" },
                        { value: "c-level", label: "C-Level" },
                        { value: "manager", label: "Manager" },
                        { value: "sales", label: "Sales" },
                        { value: "marketing", label: "Marketing" }
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setRoleFilter(option.value as any);
                            setShowRoleDropdown(false);
                          }}
                          style={{
                            width: "100%",
                            padding: "10px 16px",
                            textAlign: "left",
                            border: "none",
                            background: roleFilter === option.value ? "#f3f4f6" : "transparent",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: roleFilter === option.value ? 600 : 400
                          }}
                        >
                          {roleFilter === option.value ? "✓ " : ""}{option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sort Dropdown */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14, color: "#6b7280" }}>Sort:</span>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => setShowSortDropdown(!showSortDropdown)}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    {sortBy === "nameAsc" && "A-Z"}
                    {sortBy === "nameDesc" && "Z-A"}
                    {sortBy === "newest" && "Newest"}
                    {sortBy === "oldest" && "Oldest"}
                    {sortBy === "lastModified" && "Last Modified"}
                  </button>
              {showSortDropdown && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 4,
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                  zIndex: 1000,
                  minWidth: 180
                }}>
                  {[
                    { value: "nameAsc", label: "✓ A-Z" },
                    { value: "nameDesc", label: "Z-A" },
                    { value: "newest", label: "Newest" },
                    { value: "oldest", label: "Oldest" },
                    { value: "lastModified", label: "Last Modified" }
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSortBy(option.value as any);
                        setShowSortDropdown(false);
                      }}
                      style={{
                        width: "100%",
                        padding: "10px 16px",
                        textAlign: "left",
                        border: "none",
                        background: sortBy === option.value ? "#f3f4f6" : "transparent",
                        cursor: "pointer",
                        fontSize: 14,
                        fontWeight: sortBy === option.value ? 600 : 400
                      }}
                    >
                      {sortBy === option.value ? option.label : option.label.replace("✓ ", "")}
                    </button>
                  ))}
                </div>
              )}
            </div>
              </div>
            </div>
          </div>
        </div>
        <div className="panel-body">
          <div>
            <input
              type="text"
              placeholder="Search active users..."
              value={activeUsersSearch}
              onChange={(e) => setActiveUsersSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 13,
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                marginBottom: 8,
                marginTop: 0,
                boxSizing: "border-box",
                outline: "none"
              }}
            />
          </div>
          <div className="panel-section" style={{ paddingTop: 0, marginTop: 0 }}>
            <div className="panel-section-title" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setShowActiveUsers(!showActiveUsers)}>
              <span>{showActiveUsers ? "▾" : "▸"}</span>
              <span>Active Users</span>
            </div>
            {showActiveUsers && (
              <div className="list">
                {sortUsers(draftUsers.filter(u => !u.suspended)).filter(user => 
                  activeUsersSearch === "" || 
                  user.name.toLowerCase().includes(activeUsersSearch.toLowerCase()) ||
                  user.email.toLowerCase().includes(activeUsersSearch.toLowerCase()) ||
                  user.role.toLowerCase().includes(activeUsersSearch.toLowerCase())
                ).map((user) => {
                  const isActive = user.id === selectedUserId;
                  return (
                    <button key={user.id} className={isActive ? "list-item active" : "list-item"} onClick={() => setSelectedUserId(user.id)}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div>
                          <div className="list-item-title">{user.name}</div>
                          <div className="list-item-subtitle">
                            {user.role.toUpperCase()} • {user.email}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {draftUsers.filter(u => u.suspended).length > 0 && (
            <div className="panel-section">
              <div className="panel-section-title" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setShowSuspendedUsers(!showSuspendedUsers)}>
                <span>{showSuspendedUsers ? "▾" : "▸"}</span>
                <span>Suspended Users</span>
              </div>
              {showSuspendedUsers && (
                <div className="list">
                  {sortUsers(draftUsers.filter(u => u.suspended)).map((user) => {
                    const isActive = user.id === selectedUserId;
                    return (
                      <button key={user.id} className={isActive ? "list-item active" : "list-item"} onClick={() => setSelectedUserId(user.id)}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div>
                            <div className="list-item-title">{user.name}</div>
                            <div className="list-item-subtitle">
                          {user.role.toUpperCase()} • {user.email}
                          <span style={{ color: "#dc2626", marginLeft: 8 }}>• SUSPENDED</span>
                        </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {draftDeletedUsers.length > 0 && (
            <div className="panel-section">
              <div className="panel-section-title" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setShowDeletedUsers(!showDeletedUsers)}>
                <span>{showDeletedUsers ? "▾" : "▸"}</span>
                <span>🗑️ Deleted Users</span>
                <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>({draftDeletedUsers.length})</span>
              </div>
              {showDeletedUsers && (
                <div className="list">
                  {draftDeletedUsers.map((user) => (
                    <div key={user.id} className="list-item" style={{ backgroundColor: '#fef2f2', borderLeft: '3px solid #ef4444' }}>
                      <div style={{ flex: 1 }}>
                        <div className="list-item-title">{user.name}</div>
                        <div className="list-item-subtitle">{user.role.toUpperCase()} • {user.email}</div>
                        {user.deletedAt && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                            Deleted: {new Date(user.deletedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          className="btn-secondary btn-success btn-small"
                          onClick={async () => {
                            if (await appConfirm(`Restore ${user.name}? They will be able to log in again.`)) {
                              try {
                                await fetch(`/api/users/${user.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'restore' })
                                });
                                const [usersRes, deletedRes] = await Promise.all([
                                  fetch("/api/users?deleted=false"),
                                  fetch("/api/users?deleted=true")
                                ]);
                                if (usersRes.ok && deletedRes.ok) {
                                  const activeUsers = await usersRes.json();
                                  const deletedUsers = await deletedRes.json();
                                  setDraftUsers(activeUsers);
                                  setDraftDeletedUsers(deletedUsers);
                                  props.onUsersChange(activeUsers);
                                  props.onDeletedUsersChange(deletedUsers);
                                }
                              } catch (error) {
                                console.error('Failed to restore user:', error);
                                alert('Failed to restore user');
                              }
                            }
                          }}
                        >
                          Restore User
                        </button>
                        <button
                          type="button"
                          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          onClick={async () => {
                            if (await appConfirm(`⚠️ PERMANENTLY DELETE ${user.name}?\n\nThis CANNOT be undone. All data will be lost forever.`)) {
                              try {
                                await fetch(`/api/users/${user.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'permanent-delete' })
                                });
                                const [usersRes, deletedRes] = await Promise.all([
                                  fetch("/api/users?deleted=false"),
                                  fetch("/api/users?deleted=true")
                                ]);
                                if (usersRes.ok && deletedRes.ok) {
                                  const activeUsers = await usersRes.json();
                                  const deletedUsers = await deletedRes.json();
                                  setDraftUsers(activeUsers);
                                  setDraftDeletedUsers(deletedUsers);
                                  props.onUsersChange(activeUsers);
                                  props.onDeletedUsersChange(deletedUsers);
                                }
                              } catch (error) {
                                console.error('Failed to permanently delete user:', error);
                                alert('Failed to permanently delete user');
                              }
                            }
                          }}
                        >
                          Delete Permanently
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="panel panel-right">
        {selectedUser ? (
          <div className="panel-scroll" style={{ overflowY: "auto", maxHeight: "calc(100vh - 100px)" }}>
            <div className="panel-header">
              <div className="panel-header-row">
                <span>User Details{selectedUser.suspended && <span style={{ color: "#dc2626", marginLeft: 8 }}>• SUSPENDED</span>}</span>
                <div className="panel-header-actions">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", cursor: "pointer", userSelect: "none" }}>
                      <input
                        type="checkbox"
                        checked={!!notifyUsers[selectedUserId]}
                        onChange={e => setNotifyUsers(prev => ({ ...prev, [selectedUserId]: e.target.checked }))}
                        style={{ width: 15, height: 15, cursor: "pointer" }}
                      />
                      Notify user by email
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", cursor: "pointer", userSelect: "none" }}>
                      <input
                        type="checkbox"
                        checked={!!notifyUsersBySMS[selectedUserId]}
                        onChange={e => {
                          setNotifyUsersBySMS(prev => ({ ...prev, [selectedUserId]: e.target.checked }));
                          if (!e.target.checked) {
                            setPhoneError("");
                          }
                        }}
                        style={{ width: 15, height: 15, cursor: "pointer" }}
                      />
                      Notify user by SMS
                    </label>
                  </div>
                  <button type="button" className="btn-primary btn-small" disabled={!isDirty || !!emailError || !!phoneError || isSaving} onClick={async () => {
                    if (emailError) {
                      emailInputRef.current?.focus();
                      emailInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      return;
                    }
                    if (notifyUsersBySMS[selectedUserId] && !selectedUser.phone) {
                      setPhoneError("Phone number is required when SMS notification is enabled");
                      return;
                    }
                    setPhoneError("");
                    const isNewUser = selectedUser.id.startsWith("user-");
                    if (isNewUser && !selectedUser.role) {
                      alert("Please select a Role before saving.");
                      return;
                    }
                    const isSales = selectedUser.role === "sales";
                    if (isSales && !selectedUser.managerId) {
                      setManagerError("Please assign a Manager to this sales user before saving.");
                      return;
                    }
                    setManagerError("");
                    if (isSavingRef.current) return;
                    isSavingRef.current = true;
                    setIsSaving(true);
                    try {
                      const usersToSave = draftUsers.map((user) => ({ ...user }));
                      const managerUser = selectedUser.managerId ? draftUsers.find(u => u.id === selectedUser.managerId) : null;
                      const adminRaw = typeof window !== "undefined" ? localStorage.getItem("user") : null;
                      const adminData = adminRaw ? JSON.parse(adminRaw) : null;
                      const userToSave = usersToSave.find(u => u.id === selectedUser.id);
                      if (userToSave) {
                        const isNewUser = selectedUser.id.startsWith("user-");
                        if (isNewUser && !userToSave.email) {
                          alert("Please enter an email address before saving.");
                          return;
                        }
                        if (isNewUser && !userToSave.password) {
                          alert("Please set a password before saving.");
                          return;
                        }
                        if (isNewUser) {
                          // New user — POST
                          const res = await fetch(`/api/users`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              ...userToSave,
                              _id: undefined,
                              sendNotification: !!notifyUsers[selectedUserId],
                              sendSMSNotification: !!notifyUsersBySMS[selectedUserId],
                              adminName: adminData?.name || "Admin",
                              adminEmail: adminData?.email || "",
                              managerName: managerUser?.name || null
                            })
                          });
                          if (!res.ok) {
                            const err = await res.json().catch(() => ({}));
                            alert(`Failed to create user: ${err.error || "Unknown error"}`);
                            return;
                          }
                          const created = await res.json();
                          const newId = created.id || created.email;
                          const freshRes = await fetch("/api/users?deleted=false");
                          if (freshRes.ok) {
                            const freshUsers = await freshRes.json();
                            setDraftUsers(freshUsers);
                            props.onUsersChange(freshUsers);
                            setSelectedUserId(newId);
                          }
                        } else {
                          // Existing user — PUT
                          const putRes = await fetch(`/api/users/${encodeURIComponent(selectedUser.id)}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              ...userToSave,
                              sendNotification: !!notifyUsers[selectedUserId],
                              sendSMSNotification: !!notifyUsersBySMS[selectedUserId],
                              adminName: adminData?.name || "Admin",
                              adminEmail: adminData?.email || "",
                              managerName: managerUser?.name || null
                            })
                          });
                          if (!putRes.ok) {
                            const err = await putRes.json().catch(() => ({}));
                            alert(`Failed to save: ${err.error || "Unknown error"}`);
                            return;
                          }
                          const putData = await putRes.json().catch(() => ({}));
                          if (putData?.emailWarning) {
                            alert(`User saved, but the notification email could NOT be sent:\n\n${putData.emailWarning}`);
                          }
                          const freshRes = await fetch("/api/users?deleted=false");
                          if (freshRes.ok) {
                            const freshUsers = await freshRes.json();
                            setDraftUsers(freshUsers);
                            props.onUsersChange(freshUsers);
                            // Keep selected user in view
                            setSelectedUserId(selectedUser.id);
                          }
                        }
                        setIsDirty(false);
                        setNotifyUsers(prev => ({ ...prev, [selectedUserId]: false }));
                        setNotifyUsersBySMS(prev => ({ ...prev, [selectedUserId]: false }));
                        setSaveNotice("Changes saved successfully");
                        if (saveNoticeTimeout.current) clearTimeout(saveNoticeTimeout.current);
                        saveNoticeTimeout.current = setTimeout(() => setSaveNotice(""), 2000);
                      }
                    } finally {
                      isSavingRef.current = false;
                      setIsSaving(false);
                    }
                  }}>{isSaving ? "Saving..." : "Save Changes"}</button>
                  {saveNotice && (
                    <span style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#fff",
                      backgroundColor: "#16a34a",
                      padding: "6px 14px",
                      borderRadius: 8,
                      boxShadow: "0 2px 8px rgba(22,163,74,0.25)",
                      animation: "fadeIn 0.3s"
                    }}>✓ {saveNotice}</span>
                  )}
                  <button type="button" className="btn-secondary btn-warning btn-small" onClick={async () => {
                    const action = selectedUser.suspended ? "Unsuspend" : "Suspend";
                    if (await appConfirm(`${action} ${selectedUser.name}?`)) {
                      updateUser({ ...selectedUser, suspended: !selectedUser.suspended });
                    }
                  }}>{selectedUser.suspended ? "Unsuspend User" : "Suspend User"}</button>
                  <button type="button" className="btn-ghost btn-danger" onClick={async () => {
                    if (await appConfirm(`Delete ${selectedUser.name}?`)) deleteUser(selectedUser.id);
                  }}>Delete User</button>
                </div>
              </div>
            </div>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Name</span>
                <input className="field-input" value={selectedUser.name ?? ""} onChange={(e) => updateUser({ ...selectedUser, name: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Email</span>
                <input
                  ref={emailInputRef}
                  className="field-input" 
                  value={selectedUser.email ?? ""} 
                  onChange={(e) => {
                    updateUser({ ...selectedUser, email: e.target.value });
                    setEmailError("");
                  }}
                  onBlur={(e) => checkEmailAvailability(e.target.value, selectedUser.id)}
                  style={emailError ? { borderColor: "#dc2626", animation: "shake 0.3s" } : {}}
                />
                {emailError && (
                  <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4, animation: "fadeIn 0.3s" }}>
                    {emailError}
                  </div>
                )}
              </label>
              <label className="field">
                <span className="field-label">Reset Password</span>
                <div className="field-input" style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 8 }}>
                  <input type={showPassword ? "text" : "password"} value={selectedUser.password ?? ""} onChange={(e) => updateUser({ ...selectedUser, password: e.target.value })} placeholder="Set a login password" style={{ border: "none", outline: "none", background: "transparent", flex: 1, minWidth: 0 }} />
                  <button type="button" className="btn-ghost btn-small" onClick={() => setShowPassword((prev) => !prev)} aria-label={showPassword ? "Hide password" : "Show password"} style={{ padding: 4 }}>
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94 6.06 6.06" />
                        <path d="M9.88 9.88A3 3 0 0 0 12 15a3 3 0 0 0 2.12-.88" />
                        <path d="M6.23 6.23C4.05 7.62 2.54 9.8 2 12c1.73 4.11 5.7 7 10 7 1.59 0 3.11-.38 4.45-1.07" />
                        <path d="M14.12 5.1C13.44 4.88 12.73 4.76 12 4.76c-4.3 0-8.27 2.89-10 7 0 .02 0 .04.01.06" />
                        <path d="M19.78 19.78C21.04 18.26 21.99 16.28 22 12c-1.33-3.17-4.09-5.71-7.33-6.72" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>
              <label className="field">
                <span className="field-label">Phone{notifyUsersBySMS[selectedUserId] && <span style={{ color: "#dc2626" }}> *</span>}</span>
                <input 
                  className="field-input" 
                  value={selectedUser.phone ?? ""} 
                  onChange={(e) => {
                    updateUser({ ...selectedUser, phone: e.target.value });
                    setPhoneError("");
                  }}
                  placeholder="Enter phone number"
                  style={phoneError ? { borderColor: "#dc2626", animation: "shake 0.3s" } : {}}
                />
                {phoneError && (
                  <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4, animation: "fadeIn 0.3s" }}>
                    {phoneError}
                  </div>
                )}
              </label>
              <label className="field">
                <span className="field-label">Role</span>
                <div className="territory-field">
                  <button type="button" className={showRolesDropdown ? "territory-trigger territory-trigger-open" : "territory-trigger"} onClick={() => setShowRolesDropdown(!showRolesDropdown)}>
                    <span className="territory-trigger-value" style={{ color: (selectedUser.roles || [selectedUser.role]).filter(Boolean).length === 0 ? '#9ca3af' : undefined }}>
                      {(selectedUser.roles || [selectedUser.role]).filter(Boolean).length === 0
                        ? "-- Select a role (required) --"
                        : (selectedUser.role.charAt(0).toUpperCase() + selectedUser.role.slice(1))}
                    </span>
                    <span className="territory-trigger-icon">{showRolesDropdown ? "▲" : "▼"}</span>
                  </button>
                  {showRolesDropdown && (
                    <div className="territory-dropdown" style={{ gridTemplateColumns: "1fr" }}>
                      {(["admin", "c-level", "manager", "sales", "marketing"] as UserRole[]).map((role) => (
                        <div key={role} className={selectedUser.role === role ? "territory-option territory-option-active" : "territory-option"} onClick={() => {
                          const newRoles = [role];
                          const newManagerId = role === "sales" ? selectedUser.managerId : undefined;
                          if (role !== "sales") setManagerDraftId("");
                          updateUser({ ...selectedUser, role: role, roles: newRoles, managerId: newManagerId });
                          setShowRolesDropdown(false);
                        }}>
                          <input type="radio" checked={selectedUser.role === role} readOnly />
                          <span style={{ textTransform: "capitalize" }}>{role}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedUser.id.startsWith("user-") && !selectedUser.role && (
                  <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4, fontWeight: 500 }}>Role is required</div>
                )}
              </label>
              {selectedUser.role === "sales" && (
                <label className="field">
                  <span className="field-label">Manager <span style={{ color: "#dc2626" }}>*</span></span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <select className="field-input" style={{ flex: 1, borderColor: (!selectedUser.managerId || managerError) ? "#dc2626" : undefined }} value={managerDraftId} onChange={(e) => {
                      const nextManagerId = e.target.value;
                      setManagerDraftId(nextManagerId);
                      setManagerError("");
                      updateUser({ ...selectedUser, managerId: nextManagerId || undefined });
                    }}>
                      <option value="">-- Select a manager (required) --</option>
                      {draftUsers.filter((u) => u.role === "manager").map((manager) => (
                        <option key={manager.id} value={manager.id}>{manager.name}</option>
                      ))}
                    </select>
                  </div>
                  {(!selectedUser.managerId || managerError) && (
                    <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4, fontWeight: 500 }}>
                      {managerError || "Manager is required for sales users"}
                    </div>
                  )}
                </label>
              )}
            </div>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Strengths / Superpowers</span>
                <textarea className="field-input" rows={3} value={selectedUser.strengths ?? ""} onChange={(e) => updateUser({ ...selectedUser, strengths: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Weaknesses / Insecurities</span>
                <textarea className="field-input" rows={3} value={selectedUser.weaknesses ?? ""} onChange={(e) => updateUser({ ...selectedUser, weaknesses: e.target.value })} />
              </label>
            </div>
            {showWebPreview && selectedUser && (
              <div className="panel-section">
                <div className="panel-section-title">Rep Web Page Preview</div>
                <SalesWebPagePreview profile={selectedUser} onProfileChange={updateUser} />
              </div>
            )}
            <div style={{ marginTop: 40 }}></div>
            
            {/* Feature Toggles - Collapsible */}
            <div className="panel-section">
              <div 
                className="panel-section-title" 
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} 
                onClick={() => setShowFeatureToggles(!showFeatureToggles)}
              >
                <span>{showFeatureToggles ? "▾" : "▸"}</span>
                <span>Feature Toggles</span>
              </div>
              {showFeatureToggles && (
                <>
                  {togglesByRole.map(({ role, keys }) => (
                    <div key={role} style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#666" }}>
                        {roleLabels[role]}
                      </div>
                      <div className="toggle-grid">
                        {keys.map((key) => {
                          const enabled = selectedUser.featureToggles[key];
                          const label = featureToggleLabels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase()).replace(/ai/gi, "AI").trim();
                          return (
                            <label key={key} className="toggle-item">
                              <input type="checkbox" checked={enabled} onChange={(e) => updateFeatureToggles(selectedUser, { [key]: e.target.checked } as Partial<FeatureToggles>)} />
                              <span className="toggle-label">{label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {/* Save buttons */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, padding: "12px 0", borderTop: "1px solid #e5e7eb" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#374151", userSelect: "none" }}>
                      <input
                        type="checkbox"
                        id="applyToAllCheck"
                        style={{ width: 15, height: 15, cursor: "pointer" }}
                      />
                      Apply to all users with same role
                    </label>
                    <button
                      type="button"
                      className="btn-primary btn-small"
                      onClick={async () => {
                        const applyToAll = (document.getElementById("applyToAllCheck") as HTMLInputElement)?.checked;
                        const userRolesList = selectedUser.roles || [selectedUser.role];

                        // Build list of users to save
                        let usersToSave: UserProfile[] = [selectedUser];
                        let nextDraft = draftUsers;

                        if (applyToAll) {
                          nextDraft = draftUsers.map((u) => {
                            if (u.id === selectedUser.id) return u;
                            const uRoles = u.roles || [u.role];
                            // Find which roles this user shares with the selected user
                            const sharedRoles = userRolesList.filter(r => uRoles.includes(r));
                            if (sharedRoles.length === 0) return u;
                            // Only copy toggle keys that belong to the shared roles
                            const sharedKeys = sharedRoles.flatMap(r => featureToggleKeysByRole[r] || []);
                            const partialToggles: Partial<FeatureToggles> = {};
                            sharedKeys.forEach(k => {
                              partialToggles[k] = selectedUser.featureToggles[k];
                            });
                            return { ...u, featureToggles: { ...u.featureToggles, ...partialToggles } };
                          });
                          usersToSave = nextDraft.filter((u) => {
                            const uRoles = u.roles || [u.role];
                            return userRolesList.some(r => uRoles.includes(r));
                          });
                          setDraftUsers(nextDraft);
                        }

                        // Persist each user via API
                        try {
                          await Promise.all(usersToSave.map((u) =>
                            fetch(`/api/users/${u.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ featureToggles: u.featureToggles })
                            })
                          ));
                          props.onUsersChange(nextDraft);
                          setIsDirty(false);
                          setSaveNotice(applyToAll ? "Feature toggles applied to all matching role users" : "Feature toggles saved for this user");
                        } catch {
                          setSaveNotice("Failed to save feature toggles");
                        }
                        if (saveNoticeTimeout.current) clearTimeout(saveNoticeTimeout.current);
                        saveNoticeTimeout.current = setTimeout(() => setSaveNotice(""), 2500);
                      }}
                    >
                      Save
                    </button>
                    {saveNotice && <span style={{ fontSize: 12, color: "#16a34a" }}>{saveNotice}</span>}
                  </div>
                </>
              )}
            </div>

            {/* Training Progress - Collapsible Inline */}
            {(selectedUser.roles || [selectedUser.role]).some(r => r === 'manager' || r === 'sales') && (
              <div className="panel-section" style={{ marginTop: 24 }}>
                <div 
                  className="panel-section-title" 
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} 
                  onClick={() => {
                    setShowTrainingProgress(!showTrainingProgress);
                    if (!showTrainingProgress && trainingModalData.length === 0) {
                      openTrainingProgress(selectedUser);
                    }
                  }}
                >
                  <span>{showTrainingProgress ? "▾" : "▸"}</span>
                  <span>📊 Training Progress</span>
                </div>
                {showTrainingProgress && (
                  <div style={{ marginTop: 16 }}>
                    {isLoadingTrainingModal ? (
                      <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Loading...</div>
                    ) : trainingModalData.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
                        <div>No published courses available</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {trainingModalData.map(({ course, completed, total, isCompleted }) => {
                          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                          return (
                            <div key={course.id} style={{ 
                              padding: 16, 
                              border: '1px solid #e5e7eb', 
                              borderRadius: 8,
                              background: isCompleted ? '#f0fdf4' : '#fff'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 600, fontSize: 15, color: '#111827', marginBottom: 4 }}>
                                    {course.title}
                                  </div>
                                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                                    {completed} of {total} items completed
                                  </div>
                                </div>
                                {isCompleted && (
                                  <span style={{ 
                                    padding: '4px 10px', 
                                    borderRadius: 6, 
                                    background: '#10b981', 
                                    color: '#fff', 
                                    fontSize: 12, 
                                    fontWeight: 600 
                                  }}>
                                    ✓ Completed
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ flex: 1, height: 10, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    background: pct === 100 ? '#10b981' : pct > 0 ? '#f59e0b' : '#e5e7eb',
                                    transition: 'width 0.3s'
                                  }} />
                                </div>
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#374151', minWidth: 45 }}>{pct}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Assigned Sales Users - Collapsible */}
            {selectedUser.role === "manager" && assignedSalesUsers.length > 0 && (
              <div className="panel-section" style={{ marginTop: 24 }}>
                <div 
                  className="panel-section-title" 
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} 
                  onClick={() => setShowAssignedSales(!showAssignedSales)}
                >
                  <span>{showAssignedSales ? "▾" : "▸"}</span>
                  <span>Assigned Sales Users</span>
                </div>
                {showAssignedSales && (
                  <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 16 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: 14, color: '#374151' }}>Name</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: 14, color: '#374151' }}>Email</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: 14, color: '#374151' }}>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedSalesUsers.map((user, index) => (
                        <tr
                          key={user.id}
                          onClick={() => setSelectedUserId(user.id)}
                          style={{
                            borderBottom: index < assignedSalesUsers.length - 1 ? '1px solid #f3f4f6' : 'none',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                            backgroundColor: '#ffffff'
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = '#eff6ff';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = '#ffffff';
                          }}
                        >
                          <td style={{ padding: '12px 16px', fontSize: 14, color: '#111827', fontWeight: 500 }}>{user.name}</td>
                          <td style={{ padding: '12px 16px', fontSize: 14, color: '#6b7280' }}>{user.email}</td>
                          <td style={{ padding: '12px 16px', fontSize: 14, color: '#6b7280' }}>
                            <span style={{ backgroundColor: '#e5e7eb', padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500 }}>
                              {user.role?.charAt(0).toUpperCase() + user.role?.slice(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="panel-empty">Select a user to manage details.</div>
        )}
      </div>

      {/* Developer Accounts Modal */}
      {showDeveloperModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16,
        }}>
          <div style={{
            background: "#fff", borderRadius: 14,
            width: "100%", maxWidth: 600,
            maxHeight: "90vh", display: "flex", flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            overflow: "hidden",
          }}>
            {/* Modal header */}
            <div style={{
              padding: "18px 24px 0 24px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#f5f3ff",
            }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#7c3aed", marginBottom: 12 }}>
                👨‍💻 Developer Accounts
              </div>
              <button
                onClick={() => {
                  setShowDeveloperModal(false);
                  setDeveloperModalTab("selection");
                  setDevSearch("");
                }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 20, color: "#9ca3af", lineHeight: 1, padding: 4,
                }}
              >×</button>
            </div>

            {/* Tabs */}
            <div style={{ 
              display: "flex", 
              borderBottom: "1px solid #e5e7eb",
              background: "#f5f3ff",
              paddingLeft: 24,
              paddingRight: 24,
            }}>
              <button
                onClick={() => setDeveloperModalTab("selection")}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: developerModalTab === "selection" ? 600 : 400,
                  color: developerModalTab === "selection" ? "#7c3aed" : "#6b7280",
                  borderBottom: developerModalTab === "selection" ? "2px solid #7c3aed" : "2px solid transparent",
                }}
              >
                New Selection
              </button>
              <button
                onClick={() => setDeveloperModalTab("selected")}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: developerModalTab === "selected" ? 600 : 400,
                  color: developerModalTab === "selected" ? "#7c3aed" : "#6b7280",
                  borderBottom: developerModalTab === "selected" ? "2px solid #7c3aed" : "2px solid transparent",
                }}
              >
                Selected Accounts ({developerUsers.size})
              </button>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              <input
                type="text"
                placeholder="Search users..."
                value={devSearch}
                onChange={e => setDevSearch(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6, marginBottom: 16, boxSizing: "border-box" }}
              />
              {developerModalTab === "selection" ? (
                <>
                  <div style={{ marginBottom: 16, fontSize: 13, color: "#6b7280" }}>
                    Select users to mark as developers
                  </div>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                    {[...draftUsers].sort((a, b) => (a.name || "").localeCompare(b.name || "")).filter(u => (u.name || "").toLowerCase().includes(devSearch.toLowerCase())).map((user, idx) => {
                      const isSelected = developerUsers.has(user.id);
                      return (
                        <label
                          key={user.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "12px 16px", cursor: "pointer",
                            background: isSelected ? "#f5f3ff" : idx % 2 === 0 ? "#fff" : "#fafafa",
                            borderBottom: idx < draftUsers.length - 1 ? "1px solid #f3f4f6" : "none",
                            transition: "background 0.15s",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleDeveloperUser(user.id)}
                            style={{ width: 16, height: 16, accentColor: "#7c3aed", cursor: "pointer" }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: "#111827", fontSize: 14 }}>{user.name}</div>
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                              {(user.roles || [user.role]).map(r => r.toUpperCase()).join(", ")} • {user.email}
                            </div>
                          </div>
                          {isSelected && (
                            <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>✓ Developer</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 16, fontSize: 13, color: "#6b7280" }}>
                    {developerUsers.size} developer account{developerUsers.size !== 1 ? "s" : ""} selected
                  </div>
                  {developerUsers.size === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#9ca3af", fontSize: 13 }}>
                      No developer accounts selected
                    </div>
                  ) : (
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                      {[...draftUsers].filter(u => developerUsers.has(u.id)).sort((a, b) => (a.name || "").localeCompare(b.name || "")).filter(u => (u.name || "").toLowerCase().includes(devSearch.toLowerCase())).map((user, idx) => (
                        <div
                          key={user.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "12px 16px",
                            background: idx % 2 === 0 ? "#fff" : "#fafafa",
                            borderBottom: idx < draftUsers.filter(u => developerUsers.has(u.id)).length - 1 ? "1px solid #f3f4f6" : "none",
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: "#111827", fontSize: 14 }}>{user.name}</div>
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                              {(user.roles || [user.role]).map(r => r.toUpperCase()).join(", ")} • {user.email}
                            </div>
                          </div>
                          <span style={{ 
                            padding: "4px 10px", 
                            borderRadius: 6,
                            background: "#f5f3ff",
                            color: "#7c3aed",
                            fontSize: 11, 
                            fontWeight: 600 
                          }}>
                            ✓ Developer
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              padding: "14px 24px", borderTop: "1px solid #e5e7eb",
              display: "flex", justifyContent: "flex-end", gap: 10,
              background: "#f8fafc",
            }}>
              <button
                onClick={() => setShowDeveloperModal(false)}
                style={{
                  padding: "8px 18px", borderRadius: 8,
                  border: "1px solid #d1d5db", background: "#fff",
                  fontSize: 13, fontWeight: 600, color: "#374151",
                  cursor: "pointer",
                }}
              >Cancel</button>
              <button
                onClick={saveDeveloperAccounts}
                style={{
                  padding: "8px 20px", borderRadius: 8,
                  border: "none",
                  background: "#7c3aed",
                  fontSize: 13, fontWeight: 600, color: "#fff",
                  cursor: "pointer",
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saving Overlay */}
      {isSaving && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 2000,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#fff", borderRadius: 16,
            padding: "40px 56px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)"
          }}>
            <div style={{
              width: 48, height: 48, border: "4px solid #e5e7eb",
              borderTop: "4px solid #2563eb", borderRadius: "50%",
              animation: "spin 0.8s linear infinite"
            }} />
            <div style={{ fontSize: 18, fontWeight: 600, color: "#111827" }}>Saving User...</div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>Please wait while changes are being saved</div>
          </div>
        </div>
      )}

      {/* Assigned Sales Users Modal - REMOVED */}
      </div>
    </div>
  );
}
