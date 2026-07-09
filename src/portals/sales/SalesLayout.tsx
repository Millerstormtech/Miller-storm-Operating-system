import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Layout } from "../../components/Layout";
import { SalesSidebar } from "../../components/SalesSidebar";
import { Header } from "../../components/Header";
import { useAuth } from "../../contexts/AuthContext";

type SalesViewId = "dashboard" | "profile" | "plan" | "training" | "materials" | "aiChat" | "webPage" | "businessCards" | "apps-tools" | "ai-bot-builder" | "task-tracker" | "rankings" | "team-structure" | "storm-chat";

type SalesLayoutProps = {
  children: React.ReactNode;
  currentView: SalesViewId;
  userName?: string;
  userId?: string;
};

export function SalesLayout({ children, currentView, userName, userId }: SalesLayoutProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [allowed, setAllowed] = useState(true);

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

  useEffect(() => {
    if (!user?.id) return;
    const toggleKey = viewToToggleKey[currentView];
    if (!toggleKey) return;
    fetch(`/api/users/${user.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.featureToggles?.[toggleKey] === false) {
          setAllowed(false);
          router.replace("/sales/dashboard");
        }
      }).catch(() => {});
  }, [user?.id, currentView]);

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
