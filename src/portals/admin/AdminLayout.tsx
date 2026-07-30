import { useState } from "react";
import { Layout } from "../../components/Layout";
import { AdminSidebar, adminSidebarItems } from "../../components/AdminSidebar";
import { Header } from "../../components/Header";
import { PageHeader } from "../../components/PageHeader";
import { resolvePageTitle } from "../../lib/pageTitle";
import { useAuth } from "../../contexts/AuthContext";

type AdminViewId =
  | "dashboard"
  | "cLevelDashboard"
  | "branchManagerDashboard"
  | "salesTeamDashboard"
  | "salesRepDashboard"
  | "marketingDashboard"
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
  | "onlineTraining"
  | "messaging"
  | "leaderboard"
  | "emailConfig"
  | "teamStructure"
  | "tickets";

type AdminLayoutProps = {
  children: React.ReactNode;
  currentView: AdminViewId;
  pageTitle?: string;
  pageSubtitle?: string;
};

export function AdminLayout({ children, currentView, pageTitle, pageSubtitle }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const resolvedTitle = resolvePageTitle(adminSidebarItems, currentView, pageTitle);

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
      {resolvedTitle ? <PageHeader title={resolvedTitle} subtitle={pageSubtitle} /> : null}
      {children}
    </Layout>
  );
}

export type { AdminViewId };
