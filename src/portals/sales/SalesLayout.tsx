import { useState } from "react";
import { Layout } from "../../components/Layout";
import { SalesSidebar, salesSidebarItems } from "../../components/SalesSidebar";
import { Header } from "../../components/Header";
import { PageHeader } from "../../components/PageHeader";
import { resolvePageTitle } from "../../lib/pageTitle";
import { useAuth } from "../../contexts/AuthContext";
import { useFeatureGate } from "../../hooks/useFeatureGate";

type SalesViewId = "dashboard" | "profile" | "plan" | "training" | "materials" | "aiChat" | "webPage" | "businessCards" | "apps-tools" | "task-tracker" | "rankings" | "team-structure" | "storm-chat" | "course-leaderboard";

type SalesLayoutProps = {
  children: React.ReactNode;
  currentView: SalesViewId;
  userName?: string;
  userId?: string;
  pageTitle?: string;
  pageSubtitle?: string;
};

export function SalesLayout({ children, currentView, userName, userId, pageTitle, pageSubtitle }: SalesLayoutProps) {
  const { user, logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Map page view IDs to featureToggle keys
  const viewToToggleKey: Record<string, string> = {
    dashboard: "dashboard",
    plan: "plan",
    training: "training",
    aiChat: "aiChat",
    "apps-tools": "appsTools",
    profile: "profile",
    "task-tracker": "taskTracker",
    "storm-chat": "stormChat",
    "course-leaderboard": "trainingCenter",
    rankings: "rankings",
  };

  const allowed = useFeatureGate(user?.id, currentView, viewToToggleKey, "/sales/dashboard");
  const resolvedTitle = resolvePageTitle(salesSidebarItems, currentView, pageTitle);

  return (
    <Layout
      isSidebarCollapsed={isSidebarCollapsed}
      header={
        <Header
          title="Miller Storm Operating System"
          userName={userName ?? "Sales Rep"}
          userId={userId}
          roleLabel="Sales Rep"
          panelName="Sales Portal"
          onLogout={logout}
          showProfileDropdown={true}
        />
      }
      sidebar={
        <SalesSidebar
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

export type { SalesViewId };
