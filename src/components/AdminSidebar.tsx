import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { SidebarBrand } from "./SidebarBrand";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";

// `path` items navigate to that exact route (used for the per-role dashboards
// which live outside /admin). Items without `path` navigate to /admin/<id>.
export const adminSidebarItems: { id: string; label: string; toggleKey?: string; path?: string; group?: string }[] = [
  { id: "leaderboard", label: "Sales Leaderboard", toggleKey: "leaderboard", group: "Compete" },
  { id: "trainingExecutive", label: "Course Leaderboard", toggleKey: "trainingCenter", group: "Compete" },
  { id: "onlineTraining", label: "Training Center", toggleKey: "onlineTraining", group: "Learn" },
  { id: "courseManagement", label: "Course Builder", toggleKey: "courseManagement", group: "Learn" },
  { id: "aiBots", label: "Master Bot Builder", toggleKey: "aiBots", group: "Learn" },
  { id: "userManagement", label: "User Management", toggleKey: "userManagement", group: "Manage" },
  { id: "stormChat", label: "StormChat", toggleKey: "stormChat", group: "Manage" },
  { id: "teamStructure", label: "Organization Chart", toggleKey: "teamStructure", group: "Manage" },
  { id: "appsTools", label: "Tools & Products", toggleKey: "appsTools", group: "Manage" },
  { id: "emailConfig", label: "Email Config", toggleKey: "emailConfig", group: "Manage" },
  { id: "repActivity", label: "Rep Activity", path: "/admin/rep-activity", group: "Manage" },
  { id: "myProfile", label: "Profile", path: "/admin/my-profile", group: "Manage" },
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
          <SidebarBrand />
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
