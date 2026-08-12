import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";

// `path` items navigate to that exact route (used for the per-role dashboards
// which live outside /admin). Items without `path` navigate to /admin/<id>.
export const adminSidebarItems: { id: string; label: string; toggleKey?: string; path?: string }[] = [
  { id: "trainingExecutive", label: "Course Leaderboard", toggleKey: "trainingCenter" },
  { id: "userManagement", label: "User Management", toggleKey: "userManagement" },
  { id: "teamStructure", label: "Organization Chart", toggleKey: "teamStructure" },
  { id: "courseManagement", label: "Course Builder", toggleKey: "courseManagement" },
  { id: "onlineTraining", label: "Training Center", toggleKey: "onlineTraining" },
  { id: "appsTools", label: "Tools & Products", toggleKey: "appsTools" },
  { id: "aiBots", label: "Master Bot Builder", toggleKey: "aiBots" },
  { id: "leaderboard", label: "Sales Leaderboard", toggleKey: "leaderboard" },
  { id: "stormChat", label: "StormChat", toggleKey: "stormChat" },
  { id: "emailConfig", label: "Email Config", toggleKey: "emailConfig" },
];

const allSidebarItems = adminSidebarItems;

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
          {/* Decorative only: pointer-events:none keeps the transparent overlap
              from swallowing clicks on the first menu item. */}
          <img src="/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png" alt="Miller Storm" style={{ width: 160, height: 160, objectFit: 'contain', marginTop: -20, marginBottom: -40, pointerEvents: 'none', filter: 'brightness(0.82)' }} />
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
