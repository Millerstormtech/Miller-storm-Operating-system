import { useState } from "react";
import { Layout } from "../../components/Layout";
import { BranchManagerSidebar } from "../../components/BranchManagerSidebar";
import { Header } from "../../components/Header";
import { useAuth } from "../../contexts/AuthContext";

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
