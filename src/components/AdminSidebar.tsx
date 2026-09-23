import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { SidebarBrand } from "./SidebarBrand";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";

// `path` items navigate to that exact route (used for the per-role dashboards
// which live outside /admin). Items without `path` navigate to /admin/<id>.
export const adminSidebarItems: { id: string; label: string; toggleKey?: string; path?: string; group?: string }[] = [
  { id: "canvassMap", label: "Canvass Map", toggleKey: "canvassMap", group: "Compete" },
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
  { id: "calendar", label: "Calendar", group: "Manage" },
  { id: "docs-sops", label: "Docs & SOPs", group: "Manage" },
  { id: "repActivity", label: "Rep Activity", path: "/admin/rep-activity", group: "Manage" },
  { id: "myProfile", label: "Profile", path: "/admin/my-profile", group: "Manage" },
];

const allSidebarItems = adminSidebarItems;

// The page an item opens: its own `path`, else /admin/<id in kebab-case>.
function hrefFor(item: { id: string; path?: string }): string {
  if (item.path) return item.path;
  return `/admin/${item.id === "dashboard" ? "dashboard" : item.id.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
}

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
    router.push(hrefFor(allSidebarItems.find(i => i.id === id) ?? { id }));
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
      // An href makes each item a real link (see Sidebar.tsx), so right-click
      // "Open link in new tab" and Ctrl/middle-click work as in the other portals.
      items={sidebarItems.map((item) => ({ ...item, href: hrefFor(item) }))}
      activeId={activeId}
      onSelect={handleNavigation}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
}
