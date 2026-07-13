import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";

// `path` items navigate to that exact route (used for the per-role dashboards
// which live outside /admin). Items without `path` navigate to /admin/<id>.
const allSidebarItems: { id: string; label: string; toggleKey?: string; path?: string }[] = [
  { id: "cLevelDashboard", label: "C Level Dashboard", path: "/c-level/dashboard" },
  { id: "branchManagerDashboard", label: "Branch Manager Dashboard", path: "/branch-manager/dashboard" },
  { id: "salesTeamDashboard", label: "Sales Team Dashboard", path: "/manager/dashboard" },
  { id: "salesRepDashboard", label: "Sales Rep Dashboard", path: "/sales/dashboard" },
  { id: "marketingDashboard", label: "Marketing Dashboard", path: "/marketing/dashboard" },
  { id: "trainingExecutive", label: "Course Leaderboard", toggleKey: "trainingCenter" },
  { id: "userManagement", label: "User Management", toggleKey: "userManagement" },
  { id: "teamStructure", label: "Team Structure", toggleKey: "teamStructure" },
  { id: "courseManagement", label: "Course Builder", toggleKey: "courseManagement" },
  { id: "appsTools", label: "Apps and Tools Builder", toggleKey: "appsTools" },
  { id: "aiBots", label: "Master Bots Builder", toggleKey: "aiBots" },
  { id: "leaderboard", label: "Sales Leaderboard", toggleKey: "leaderboard" },
  { id: "stormChat", label: "StormChat", toggleKey: "stormChat" },
  { id: "emailConfig", label: "Email Config", toggleKey: "emailConfig" },
];

type AdminSidebarProps = {
  activeId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onLogout?: () => void;
};

export function AdminSidebar({ activeId, isCollapsed, onToggleCollapse, onLogout }: AdminSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const featureToggles = useFeatureToggles(user?.id);

  const sidebarItems = featureToggles
    ? allSidebarItems.filter(item => !item.toggleKey || featureToggles[item.toggleKey] !== false)
    : allSidebarItems;

  function handleNavigation(id: string) {
    const item = allSidebarItems.find(i => i.id === id);
    if (item?.path) {
      router.push(item.path);
      return;
    }
    router.push(`/admin/${id === "dashboard" ? "dashboard" : id.replace(/([A-Z])/g, "-$1").toLowerCase()}`);
  }

  return (
    <Sidebar
      header={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%', paddingTop: 0, marginTop: -30 }}>
          <img src="/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png" alt="Miller Storm" style={{ width: 160, height: 160, objectFit: 'contain', marginTop: -20, marginBottom: -40 }} />
        </div>
      }
      items={sidebarItems}
      activeId={activeId}
      onSelect={handleNavigation}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
}
