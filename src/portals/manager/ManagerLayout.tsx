import { useState } from "react";
import { Layout } from "../../components/Layout";
import { ManagerSidebar } from "../../components/ManagerSidebar";
import { Header } from "../../components/Header";
import { useAuth } from "../../contexts/AuthContext";
import { useFeatureGate } from "../../hooks/useFeatureGate";

type ManagerViewId = "dashboard" | "team" | "plans" | "training" | "onlineTraining" | "taskTracker" | "webTemplates" | "apps-tools" | "jays-ai-clone" | "my-profile" | "task-manager" | "ai-bot-builder" | "team-structure" | "rankings" | "storm-chat";

type ManagerLayoutProps = {
  children: React.ReactNode;
  currentView: ManagerViewId;
};

export function ManagerLayout({ children, currentView }: ManagerLayoutProps) {
  const { user, logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const viewToToggleKey: Record<string, string> = {
    dashboard: "dashboard",
    plans: "plans",
    onlineTraining: "onlineTraining",
    "jays-ai-clone": "aiChat",
    "apps-tools": "appsTools",
    "my-profile": "profile",
    "task-manager": "taskTracker",
    "ai-bot-builder": "aiBots",
    "storm-chat": "stormChat",
  };

  const allowed = useFeatureGate(user?.id, currentView, viewToToggleKey, "/manager/dashboard");

  return (
    <Layout
      isSidebarCollapsed={isSidebarCollapsed}
      header={
        <Header
          title="Miller Storm Operating System"
          userName={user?.name ?? "Manager"}
          userId={user?.id}
          roleLabel="Manager"
          panelName="Manager Portal"
          onLogout={logout}
        />
      }
      sidebar={
        <ManagerSidebar
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

export type { ManagerViewId };
