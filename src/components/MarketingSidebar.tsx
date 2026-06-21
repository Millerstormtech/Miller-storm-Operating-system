import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useState } from "react";

const baseItems = [
  { id: "dashboard", label: "Dashboard", toggleKey: "dashboard" },
  { id: "assets", label: "Marketing Assets", toggleKey: "assets" },
  { id: "approvals", label: "Approval Queue", toggleKey: "approvals" },
  { id: "socialMetrics", label: "Social Metrics", toggleKey: "socialMetrics" },
  { id: "apps-tools", label: "Apps & Tools", toggleKey: "appsTools" },
  { id: "ai-chat", label: "AI Assistant", toggleKey: "aiAssistant" },
];

type MarketingSidebarProps = {
  activeId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

function getCached(userId: string): Record<string, boolean> | null {
  try {
    const raw = sessionStorage.getItem(`ft_${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setCache(userId: string, toggles: Record<string, boolean>) {
  try { sessionStorage.setItem(`ft_${userId}`, JSON.stringify(toggles)); } catch {}
}

export function MarketingSidebar({ activeId, isCollapsed, onToggleCollapse }: MarketingSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [hasBotAccess, setHasBotAccess] = useState(false);
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean> | null>(
    user?.id ? getCached(user.id) : null
  );

  useEffect(() => {
    if (!user?.id) return;
    fetch("/api/ai-bots").then(r => r.ok ? r.json() : []).then((bots: any[]) => {
      setHasBotAccess(bots.some((b: any) => b.teamMembers?.includes(user.id)));
    });
    fetch(`/api/users/${user.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.featureToggles) {
          setCache(user.id, data.featureToggles);
          setFeatureToggles(data.featureToggles);
        }
      })
      .catch(() => {});
  }, [user?.id]);

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
