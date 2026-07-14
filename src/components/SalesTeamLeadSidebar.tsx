import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";
import { useBotAccess } from "../hooks/useBotAccess";

const baseItems = [
  { id: "dashboard", label: "Team Dashboard", toggleKey: "dashboard" },
  { id: "team-structure", label: "Team Structure", toggleKey: "teamStructure" },
  { id: "plans", label: "Team Business Planners", toggleKey: "plans" },
  { id: "onlineTraining", label: "Training Center", toggleKey: "onlineTraining" },
  { id: "jays-ai-clone", label: "Jay's AI Clone", toggleKey: "aiChat" },
  { id: "storm-chat", label: "StormChat", toggleKey: "stormChat" },
  { id: "apps-tools", label: "Tools & Products", toggleKey: "appsTools" },
  { id: "rankings", label: "Sales Leaderboard", toggleKey: "rankings" },
  { id: "my-profile", label: "My Profile", toggleKey: "profile" },
  { id: "task-manager", label: "Team Tasks", toggleKey: "taskTracker" },
];

type SalesTeamLeadSidebarProps = {
  activeId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function SalesTeamLeadSidebar({ activeId, isCollapsed, onToggleCollapse }: SalesTeamLeadSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const hasBotAccess = useBotAccess(user?.id);
  const featureToggles = useFeatureToggles(user?.id);

  const allItems = hasBotAccess
    ? [...baseItems, { id: "ai-bot-builder", label: "Master Bot Builder", toggleKey: "aiBots" }]
    : baseItems;

  const sidebarItems = featureToggles
    ? allItems.filter(item => featureToggles[item.toggleKey] !== false)
    : allItems;

  function handleNavigation(id: string) {
    router.push(`/manager/${id}`);
  }

  return (
    <Sidebar
      header={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%', marginTop: -30 }}>
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
