import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Layout } from "../../components/Layout";
import { ManagerSidebar } from "../../components/ManagerSidebar";
import { Header } from "../../components/Header";
import { useAuth } from "../../contexts/AuthContext";

type ManagerViewId = "dashboard" | "team" | "plans" | "training" | "onlineTraining" | "taskTracker" | "webTemplates" | "apps-tools" | "jays-ai-clone" | "my-profile" | "task-manager" | "ai-bot-builder";

type ManagerLayoutProps = {
  children: React.ReactNode;
  currentView: ManagerViewId;
};

export function ManagerLayout({ children, currentView }: ManagerLayoutProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [allowed, setAllowed] = useState(true);

  const viewToToggleKey: Record<string, string> = {
    dashboard: "dashboard",
    plans: "plans",
    onlineTraining: "onlineTraining",
    "jays-ai-clone": "aiChat",
    "apps-tools": "appsTools",
    "my-profile": "profile",
    "task-manager": "taskTracker",
    "ai-bot-builder": "aiBots",
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
          router.replace("/manager/dashboard");
        }
      }).catch(() => {});
  }, [user?.id, currentView]);

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
