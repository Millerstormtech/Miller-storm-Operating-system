import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";
import { useBotAccess } from "../hooks/useBotAccess";

const baseItems = [
  { id: "dashboard", label: "Dashboard", toggleKey: "dashboard" },
  { id: "assets", label: "Marketing Assets", toggleKey: "assets" },
  { id: "apps-tools", label: "Tools & Products", toggleKey: "appsTools" },
  { id: "rankings", label: "Sales Leaderboard", toggleKey: "rankings" },
  { id: "ai-chat", label: "AI Assistant", toggleKey: "aiAssistant" },
];

type MarketingSidebarProps = {
  activeId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function MarketingSidebar({ activeId, isCollapsed, onToggleCollapse }: MarketingSidebarProps) {
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
    router.push(`/marketing/${id}`);
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
