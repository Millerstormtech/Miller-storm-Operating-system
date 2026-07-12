import { useState } from "react";
import { Layout } from "../../components/Layout";
import { CLevelSidebar } from "../../components/CLevelSidebar";
import { Header } from "../../components/Header";
import { useAuth } from "../../contexts/AuthContext";

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
