import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { SidebarBrand } from "./SidebarBrand";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";

// Branch Manager (executive) panel navigation. Company-wide view — every item shows the
// whole organization, not a single team. Each item carries a feature-toggle key so
// an admin can hide any page for this user from User Management.
export const branchManagerSidebarItems: { id: string; label: string; toggleKey?: string; href?: string }[] = [
  { id: "dashboard", label: "My Dashboard", href: "/branch-manager/dashboard", toggleKey: "dashboard" },
  { id: "storm-chat", label: "StormChat", href: "/branch-manager/storm-chat", toggleKey: "stormChat" },
  { id: "course-leaderboard", label: "Course Leaderboard", href: "/branch-manager/course-leaderboard", toggleKey: "trainingCenter" },
  { id: "user-management", label: "User Management", href: "/branch-manager/user-management", toggleKey: "userManagement" },
  { id: "apps-tools", label: "Tools & Products", href: "/branch-manager/apps-tools", toggleKey: "appsTools" },
  { id: "sales-leaderboard", label: "Sales Leaderboard", href: "/branch-manager/sales-leaderboard", toggleKey: "leaderboard" },
  { id: "training", label: "Training Center", href: "/branch-manager/training", toggleKey: "training" },
  { id: "jays-ai-clone", label: "Jayi", href: "/branch-manager/jays-ai-clone", toggleKey: "aiChat" },
  { id: "team-structure", label: "Organization Chart", href: "/branch-manager/team-structure", toggleKey: "teamStructure" },
  // No toggleKey, matching admin's own Rep Activity link (also un-togglable) —
  // this is a leadership-visibility page, not a per-user permission.
  { id: "rep-activity", label: "Rep Activity", href: "/branch-manager/rep-activity" },
  { id: "calendar", label: "My Calendar", href: "/branch-manager/calendar", toggleKey: "calendar" },
  { id: "docs-sops", label: "Docs & SOPs", href: "/branch-manager/docs-sops" },
  { id: "my-profile", label: "Profile", href: "/branch-manager/my-profile", toggleKey: "profile" },
];

const baseItems = branchManagerSidebarItems;

type BranchManagerSidebarProps = {
  activeId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function BranchManagerSidebar({ activeId, isCollapsed, onToggleCollapse }: BranchManagerSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const featureToggles = useFeatureToggles(user?.id);

  // Hide any page whose feature toggle is explicitly turned off for this user.
  const sidebarItems = featureToggles
    ? baseItems.filter(item => !item.toggleKey || featureToggles[item.toggleKey] !== false)
    : baseItems;

  function handleNavigation(id: string) {
    // Clicking "Training Center" while already on it returns to the course list.
    if (id === "training" && router.pathname === "/branch-manager/training") {
      window.dispatchEvent(new CustomEvent("reset-training-view"));
      return;
    }
    router.push(`/branch-manager/${id}`);
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
