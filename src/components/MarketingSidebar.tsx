import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { SidebarBrand } from "./SidebarBrand";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";

export const marketingSidebarItems = [
  { id: "dashboard", label: "My Dashboard", href: "/marketing/dashboard", toggleKey: "dashboard" },
  { id: "assets", label: "Marketing Assets", href: "/marketing/assets", toggleKey: "assets" },
  { id: "course-leaderboard", label: "Course Leaderboard", href: "/marketing/course-leaderboard", toggleKey: "trainingCenter" },
  { id: "training", label: "Training Center", href: "/marketing/training", toggleKey: "training" },
  { id: "apps-tools", label: "Tools & Products", href: "/marketing/apps-tools", toggleKey: "appsTools" },
  { id: "rankings", label: "Sales Leaderboard", href: "/marketing/rankings", toggleKey: "rankings" },
  { id: "storm-chat", label: "StormChat", href: "/marketing/storm-chat", toggleKey: "stormChat" },
  { id: "ai-chat", label: "Jayi", href: "/marketing/ai-chat", toggleKey: "aiAssistant" },
  { id: "team-structure", label: "Organization Chart", href: "/marketing/team-structure", toggleKey: "teamStructure" },
  { id: "calendar", label: "My Calendar", href: "/marketing/calendar", toggleKey: "calendar" },
  { id: "profile", label: "Profile", href: "/marketing/profile", toggleKey: "profile" },
];

const baseItems = marketingSidebarItems;

type MarketingSidebarProps = {
  activeId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function MarketingSidebar({ activeId, isCollapsed, onToggleCollapse }: MarketingSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const featureToggles = useFeatureToggles(user?.id);

  const sidebarItems = featureToggles
    ? baseItems.filter(item => featureToggles[item.toggleKey] !== false)
    : baseItems;

  function handleNavigation(id: string) {
    router.push(`/marketing/${id}`);
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
