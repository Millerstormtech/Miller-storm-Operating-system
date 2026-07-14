import { useState } from "react";
import { Layout } from "../../components/Layout";
import { CLevelSidebar } from "../../components/CLevelSidebar";
import { Header } from "../../components/Header";
import { useAuth } from "../../contexts/AuthContext";
import { useFeatureGate } from "../../hooks/useFeatureGate";

// Maps each page (currentView) to its feature-toggle key so a page hidden in
// User Management is also blocked when opened directly by URL.
const C_LEVEL_VIEW_TOGGLE: Record<string, string> = {
  dashboard: "dashboard",
  "course-leaderboard": "trainingCenter",
  "team-structure": "teamStructure",
  "apps-tools": "appsTools",
  training: "training",
  "sales-leaderboard": "leaderboard",
  "storm-chat": "stormChat",
  "jays-ai-clone": "aiChat",
  "my-profile": "profile",
};

type CLevelViewId =
  | "dashboard"
  | "storm-chat"
  | "course-leaderboard"
  | "team-structure"
  | "apps-tools"
  | "sales-leaderboard"
  | "training"
  | "jays-ai-clone"
  | "my-profile";

type CLevelLayoutProps = {
  children: React.ReactNode;
  currentView: CLevelViewId;
};

export function CLevelLayout({ children, currentView }: CLevelLayoutProps) {
  const { user, logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  // Redirect to the dashboard if this page's feature toggle is off for the user.
  useFeatureGate(user?.id, currentView, C_LEVEL_VIEW_TOGGLE, "/c-level/dashboard");

  return (
    <Layout
      isSidebarCollapsed={isSidebarCollapsed}
      header={
        <Header
          title="Miller Storm Operating System"
          userName={user?.name ?? "Executive"}
          userId={user?.id}
          roleLabel="C-Level"
          panelName="C-Level Portal"
          onLogout={logout}
          showProfileDropdown={true}
        />
      }
      sidebar={
        <CLevelSidebar
          activeId={currentView}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />
      }
    >
      {children}
    </Layout>
  );
}

export type { CLevelViewId };
