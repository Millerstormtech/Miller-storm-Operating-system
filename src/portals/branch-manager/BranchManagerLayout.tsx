import { useState } from "react";
import { Layout } from "../../components/Layout";
import { BranchManagerSidebar } from "../../components/BranchManagerSidebar";
import { Header } from "../../components/Header";
import { useAuth } from "../../contexts/AuthContext";
import { useFeatureGate } from "../../hooks/useFeatureGate";

// Maps each page (currentView) to its feature-toggle key so a page hidden in
// User Management is also blocked when opened directly by URL.
const BRANCH_MANAGER_VIEW_TOGGLE: Record<string, string> = {
  dashboard: "dashboard",
  "storm-chat": "stormChat",
  "course-leaderboard": "trainingCenter",
  "team-structure": "teamStructure",
  "apps-tools": "appsTools",
  "sales-leaderboard": "leaderboard",
  training: "training",
  "jays-ai-clone": "aiChat",
  "my-profile": "profile",
};

type BranchManagerViewId =
  | "dashboard"
  | "storm-chat"
  | "course-leaderboard"
  | "team-structure"
  | "apps-tools"
  | "sales-leaderboard"
  | "training"
  | "jays-ai-clone"
  | "my-profile";

type BranchManagerLayoutProps = {
  children: React.ReactNode;
  currentView: BranchManagerViewId;
};

export function BranchManagerLayout({ children, currentView }: BranchManagerLayoutProps) {
  const { user, logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  // Redirect to the dashboard if this page's feature toggle is off for the user.
  useFeatureGate(user?.id, currentView, BRANCH_MANAGER_VIEW_TOGGLE, "/branch-manager/dashboard");

  return (
    <Layout
      isSidebarCollapsed={isSidebarCollapsed}
      header={
        <Header
          title="Miller Storm Operating System"
          userName={user?.name ?? "Executive"}
          userId={user?.id}
          roleLabel="Branch Manager"
          panelName="Branch Manager Portal"
          onLogout={logout}
          showProfileDropdown={true}
        />
      }
      sidebar={
        <BranchManagerSidebar
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

export type { BranchManagerViewId };
