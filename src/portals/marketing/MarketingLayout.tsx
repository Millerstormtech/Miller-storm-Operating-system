import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Layout } from "../../components/Layout";
import { MarketingSidebar } from "../../components/MarketingSidebar";
import { Header } from "../../components/Header";
import { useAuth } from "../../contexts/AuthContext";

type MarketingViewId = "dashboard" | "assets" | "approvals" | "socialMetrics" | "training" | "apps-tools" | "ai-chat" | "ai-bot-builder";

type MarketingLayoutProps = {
  children: React.ReactNode;
  currentView: MarketingViewId;
};

export function MarketingLayout({ children, currentView }: MarketingLayoutProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [allowed, setAllowed] = useState(true);

  const viewToToggleKey: Record<string, string> = {
    dashboard: "dashboard",
    assets: "assets",
    approvals: "approvals",
    socialMetrics: "socialMetrics",
    "apps-tools": "appsTools",
    "ai-chat": "aiAssistant",
    "ai-bot-builder": "aiBots",
  };

  useEffect(() => {
    if (!user?.id) return;
    const toggleKey = viewToToggleKey[currentView];
    if (!toggleKey) return;
    fetch(`/api/users/${user.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.featureToggles?.[toggleKey] === false) {
          setAllowed(false);
          router.replace("/marketing/dashboard");
        }
      }).catch(() => {});
  }, [user?.id, currentView]);

  return (
    <Layout
      isSidebarCollapsed={isSidebarCollapsed}
      header={
        <Header
          title="Miller Storm Operating System"
          userName={user?.name ?? "Marketing"}
          roleLabel="Marketing"
          panelName="Marketing Portal"
          onLogout={logout}
        />
      }
      sidebar={
        <MarketingSidebar
          activeId={currentView}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />
      }
    >
      {allowed ? children : null}
    </Layout>
  );
}

export type { MarketingViewId };
