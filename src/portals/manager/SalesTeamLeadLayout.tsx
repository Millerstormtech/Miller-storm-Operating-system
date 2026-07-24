import { useState } from "react";
import { Layout } from "../../components/Layout";
import { SalesTeamLeadSidebar, salesTeamLeadSidebarItems } from "../../components/SalesTeamLeadSidebar";
import { Header } from "../../components/Header";
import { PageHeader } from "../../components/PageHeader";
import { resolvePageTitle } from "../../lib/pageTitle";
import { useAuth } from "../../contexts/AuthContext";
import { useFeatureGate } from "../../hooks/useFeatureGate";

type SalesTeamLeadViewId = "dashboard" | "team" | "plans" | "training" | "onlineTraining" | "taskTracker" | "webTemplates" | "apps-tools" | "jays-ai-clone" | "my-profile" | "task-manager" | "ai-bot-builder" | "team-structure" | "rankings" | "storm-chat" | "course-leaderboard";

type SalesTeamLeadLayoutProps = {
  children: React.ReactNode;
  currentView: SalesTeamLeadViewId;
  pageTitle?: string;
  pageSubtitle?: string;
};

export function SalesTeamLeadLayout({ children, currentView, pageTitle, pageSubtitle }: SalesTeamLeadLayoutProps) {
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
    "course-leaderboard": "trainingCenter",
    rankings: "rankings",
  };

  const allowed = useFeatureGate(user?.id, currentView, viewToToggleKey, "/manager/dashboard");
  const resolvedTitle = resolvePageTitle(salesTeamLeadSidebarItems, currentView, pageTitle);

  return (
    <Layout
      isSidebarCollapsed={isSidebarCollapsed}
      header={
        <Header
          title="Miller Storm Operating System"
          userName={user?.name ?? "Sales Team Lead"}
          userId={user?.id}
          roleLabel="Sales Team Lead"
          panelName="Sales Team Lead Portal"
          onLogout={logout}
        />
      }
      sidebar={
        <SalesTeamLeadSidebar
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

export type { SalesTeamLeadViewId };
