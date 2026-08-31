import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { SidebarBrand } from "./SidebarBrand";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";

// Sales Rep sidebar — the exact set of features they get (order matches the
// portal spec). My Goals (/sales/plan) and the Master Bot Builder are
// intentionally NOT here. (Raise a Ticket lives in the top bar, not
// the sidebar.) My Goals currently has no way in at all: the Scoreboard tile
// link that would reach it is switched off behind SHOW_GOAL_LINK in
// MetricTile.tsx until My Goals launches.
// My Tasks is deliberately NOT here either. It shipped in 2026-08 and Jay
// cancelled the feature on 2026-08-05, so the nav entry was removed. The page
// and its API still exist but nothing links to them; see the note in
// pages/*/my-tasks.tsx before reviving or deleting them.
export const salesSidebarItems = [
  { id: "dashboard", label: "My Dashboard", toggleKey: "dashboard" },
  { id: "storm-chat", label: "StormChat", toggleKey: "stormChat" },
  { id: "course-leaderboard", label: "Course Leaderboard", toggleKey: "trainingCenter" },
  { id: "apps-tools", label: "Tools & Products", toggleKey: "appsTools" },
  { id: "rankings", label: "Sales Leaderboard", toggleKey: "rankings" },
  { id: "training", label: "Training Center", toggleKey: "training" },
  { id: "aiChat", label: "Jayi", toggleKey: "aiChat" },
  { id: "team-structure", label: "Organization Chart", toggleKey: "teamStructure" },
  { id: "profile", label: "Profile", toggleKey: "profile" },
];

const baseItems = salesSidebarItems;

type SalesSidebarProps = {
  activeId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function SalesSidebar({ activeId, isCollapsed, onToggleCollapse }: SalesSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const featureToggles = useFeatureToggles(user?.id);

  const sidebarItems = featureToggles
    ? baseItems.filter(item => featureToggles[item.toggleKey] !== false)
    : baseItems;

  function handleNavigation(id: string) {
    // Clicking "Training Center" while already on it should return to the course
    // list. Same-route navigation doesn't remount the page (so a course stays
    // open), so we signal the Training Center to reset to its course grid.
    if (id === "training" && router.pathname === "/sales/training") {
      window.dispatchEvent(new CustomEvent("reset-training-view"));
      return;
    }
    router.push(`/sales/${id}`);
  }

  return (
    <Sidebar
      header={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%', marginTop: -30 }}>
          {/* Decorative only. The 160px box is mostly transparent padding and the
              negative bottom margin pulls the menu up under it, so without
              pointer-events:none the invisible overlap swallows clicks meant for
              the first menu item. */}
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
