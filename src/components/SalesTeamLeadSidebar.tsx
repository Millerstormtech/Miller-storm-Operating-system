import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { SidebarBrand } from "./SidebarBrand";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";

// Sales Team Lead sidebar — the exact set of features they get (order matches
// the portal spec). Team Goals (/sales/plan) and the Master Bot
// Builder are intentionally NOT here. (Raise a Ticket lives in the top bar, not
// the sidebar.) The old Team Tasks page was folded into My Tasks in 2026-08,
// and My Tasks itself was cancelled by Jay on 2026-08-05, so neither is here.
// The page and its API still exist but nothing links to them. Team Goals
// currently has no way in at all either: the Scoreboard tile link that would
// reach it is switched off behind SHOW_GOAL_LINK in MetricTile.tsx until My
// Goals launches.
export const salesTeamLeadSidebarItems = [
  { id: "dashboard", label: "My Dashboard", href: "/manager/dashboard", toggleKey: "dashboard" },
  { id: "canvass-map", label: "Canvass Map", href: "/manager/canvass-map", toggleKey: "canvassMap" },
  { id: "storm-chat", label: "StormChat", href: "/manager/storm-chat", toggleKey: "stormChat" },
  { id: "course-leaderboard", label: "Course Leaderboard", href: "/manager/course-leaderboard", toggleKey: "trainingCenter" },
  { id: "apps-tools", label: "Tools & Products", href: "/manager/apps-tools", toggleKey: "appsTools" },
  { id: "rankings", label: "Sales Leaderboard", href: "/manager/rankings", toggleKey: "rankings" },
  { id: "onlineTraining", label: "Training Center", href: "/manager/onlineTraining", toggleKey: "onlineTraining" },
  { id: "jays-ai-clone", label: "Jayi", href: "/manager/jays-ai-clone", toggleKey: "aiChat" },
  { id: "team-structure", label: "Organization Chart", href: "/manager/team-structure", toggleKey: "teamStructure" },
  { id: "calendar", label: "My Calendar", href: "/manager/calendar", toggleKey: "calendar" },
  { id: "my-profile", label: "Profile", href: "/manager/my-profile", toggleKey: "profile" },
];

const baseItems = salesTeamLeadSidebarItems;

type SalesTeamLeadSidebarProps = {
  activeId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function SalesTeamLeadSidebar({ activeId, isCollapsed, onToggleCollapse }: SalesTeamLeadSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const featureToggles = useFeatureToggles(user?.id);

  const sidebarItems = featureToggles
    ? baseItems.filter(item => featureToggles[item.toggleKey] !== false)
    : baseItems;

  function handleNavigation(id: string) {
    // Clicking "Training Center" while already on it returns to the course list.
    if (id === "onlineTraining" && router.pathname === "/manager/onlineTraining") {
      window.dispatchEvent(new CustomEvent("reset-training-view"));
      return;
    }
    router.push(`/manager/${id}`);
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
