import { useState } from "react";
import { Layout } from "../../components/Layout";
import { AdminSidebar } from "../../components/AdminSidebar";
import { Header } from "../../components/Header";
import { useAuth } from "../../contexts/AuthContext";

type AdminViewId =
  | "dashboard"
  | "userManagement"
  | "roleHierarchy"
  | "businessUnits"
  | "salesOverview"
  | "marketingOverview"
  | "courseManagement"
  | "courseAiBots"
  | "materialsLibrary"
  | "approvalWorkflows"
  | "aiBots"
  | "webTemplates"
  | "appsTools"
  | "stormChat"
  | "socialMediaMetrics"
  | "webText"
  | "trainingExecutive"
  | "messaging"
  | "leaderboard"
  | "emailConfig";

type AdminLayoutProps = {
  children: React.ReactNode;
  currentView: AdminViewId;
};

export function AdminLayout({ children, currentView }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <Layout
      isSidebarCollapsed={isSidebarCollapsed}
      header={
        <Header
          title="Miller Storm Operating System"
          userName={user?.name ?? "Admin"}
          userId={user?.id}
          roleLabel="Admin"
          panelName="Admin Portal"
          onLogout={logout}
        />
      }
      sidebar={
        <AdminSidebar
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

export type { AdminViewId };
