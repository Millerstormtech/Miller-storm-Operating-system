import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Layout } from "../../components/Layout";
import { MarketingSidebar, marketingSidebarItems } from "../../components/MarketingSidebar";
import { Header } from "../../components/Header";
import { PageHeader } from "../../components/PageHeader";
import { resolvePageTitle } from "../../lib/pageTitle";
import { useAuth } from "../../contexts/AuthContext";

type MarketingViewId = "dashboard" | "assets" | "approvals" | "socialMetrics" | "training" | "apps-tools" | "ai-chat" | "rankings" | "course-leaderboard" | "storm-chat" | "profile";

type MarketingLayoutProps = {
  children: React.ReactNode;
  currentView: MarketingViewId;
  pageTitle?: string;
  pageSubtitle?: string;
};

export function MarketingLayout({ children, currentView, pageTitle, pageSubtitle }: MarketingLayoutProps) {
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
    "course-leaderboard": "trainingCenter",
    training: "training",
    "storm-chat": "stormChat",
    profile: "profile",
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

  const resolvedTitle = resolvePageTitle(marketingSidebarItems, currentView, pageTitle);

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
      {allowed ? (
        <>
          {resolvedTitle ? <PageHeader title={resolvedTitle} subtitle={pageSubtitle} /> : null}
          {children}
        </>
      ) : null}
    </Layout>
  );
}

export type { MarketingViewId };
