import { useState } from "react";
import { Layout } from "../../components/Layout";
import { SalesSidebar } from "../../components/SalesSidebar";
import { Header } from "../../components/Header";
import { useAuth } from "../../contexts/AuthContext";
import { useFeatureGate } from "../../hooks/useFeatureGate";

type SalesViewId = "dashboard" | "profile" | "plan" | "training" | "materials" | "aiChat" | "webPage" | "businessCards" | "apps-tools" | "ai-bot-builder" | "task-tracker" | "rankings" | "team-structure" | "storm-chat";

type SalesLayoutProps = {
  children: React.ReactNode;
  currentView: SalesViewId;
  userName?: string;
  userId?: string;
};

export function SalesLayout({ children, currentView, userName, userId }: SalesLayoutProps) {
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
    "ai-bot-builder": "aiBots",
    "task-tracker": "taskTracker",
    "storm-chat": "stormChat",
  };

  const allowed = useFeatureGate(user?.id, currentView, viewToToggleKey, "/sales/dashboard");

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
      {allowed ? children : null}
    </Layout>
  );
}

export type { SalesViewId };
