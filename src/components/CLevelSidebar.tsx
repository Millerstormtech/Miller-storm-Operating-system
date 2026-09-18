import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { SidebarBrand } from "./SidebarBrand";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";

// C-Level (executive) panel navigation. Company-wide view — every item shows the
// whole organization, not a single team. Each item carries a feature-toggle key
// so an admin can hide any page for this user from User Management.
export const cLevelSidebarItems: { id: string; label: string; toggleKey?: string; href?: string }[] = [
  { id: "dashboard", label: "My Dashboard", href: "/c-level/dashboard", toggleKey: "dashboard" },
  { id: "canvass-map", label: "Canvass Map", href: "/c-level/canvass-map", toggleKey: "canvassMap" },
  { id: "course-leaderboard", label: "Course Leaderboard", href: "/c-level/course-leaderboard", toggleKey: "trainingCenter" },
  { id: "user-management", label: "User Management", href: "/c-level/user-management", toggleKey: "userManagement" },
  { id: "apps-tools", label: "Tools & Products", href: "/c-level/apps-tools", toggleKey: "appsTools" },
  { id: "training", label: "Training Center", href: "/c-level/training", toggleKey: "training" },
  { id: "sales-leaderboard", label: "Sales Leaderboard", href: "/c-level/sales-leaderboard", toggleKey: "leaderboard" },
  { id: "storm-chat", label: "StormChat", href: "/c-level/storm-chat", toggleKey: "stormChat" },
  { id: "jays-ai-clone", label: "Jayi", href: "/c-level/jays-ai-clone", toggleKey: "aiChat" },
  { id: "team-structure", label: "Organization Chart", href: "/c-level/team-structure", toggleKey: "teamStructure" },
  // No toggleKey, matching admin's own Rep Activity link (also un-togglable) —
  // this is a leadership-visibility page, not a per-user permission.
  { id: "rep-activity", label: "Rep Activity", href: "/c-level/rep-activity" },
  { id: "calendar", label: "My Calendar", href: "/c-level/calendar", toggleKey: "calendar" },
  { id: "my-profile", label: "Profile", href: "/c-level/my-profile", toggleKey: "profile" },
];

const baseItems = cLevelSidebarItems;

type CLevelSidebarProps = {
  activeId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function CLevelSidebar({ activeId, isCollapsed, onToggleCollapse }: CLevelSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const featureToggles = useFeatureToggles(user?.id);

  // Hide any page whose feature toggle is explicitly turned off for this user.
  const sidebarItems = featureToggles
    ? baseItems.filter(item => !item.toggleKey || featureToggles[item.toggleKey] !== false)
    : baseItems;

  function handleNavigation(id: string) {
    // Clicking "Training Center" while already on it returns to the course list.
    if (id === "training" && router.pathname === "/c-level/training") {
      window.dispatchEvent(new CustomEvent("reset-training-view"));
      return;
    }
    router.push(`/c-level/${id}`);
  }

  return (
    <Sidebar
      header={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%', marginTop: -30 }}>
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
