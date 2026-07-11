import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";
import { useBotAccess } from "../hooks/useBotAccess";

const baseItems = [
  { id: "dashboard", label: "Dashboard", toggleKey: "dashboard" },
  { id: "team-structure", label: "Team Structure", toggleKey: "teamStructure" },
  { id: "plan", label: "Business Planner", toggleKey: "plan" },
  { id: "training", label: "Training Center", toggleKey: "training" },
  { id: "aiChat", label: "Jay's AI Clone", toggleKey: "aiChat" },
  { id: "storm-chat", label: "StormChat", toggleKey: "stormChat" },
  { id: "task-tracker", label: "Task Tracker", toggleKey: "taskTracker" },
  { id: "apps-tools", label: "Apps & Tools", toggleKey: "appsTools" },
  { id: "rankings", label: "Sales Rankings", toggleKey: "rankings" },
  { id: "profile", label: "My Profile", toggleKey: "profile" },
];

type SalesSidebarProps = {
  activeId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function SalesSidebar({ activeId, isCollapsed, onToggleCollapse }: SalesSidebarProps) {
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
    router.push(`/sales/${id}`);
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
