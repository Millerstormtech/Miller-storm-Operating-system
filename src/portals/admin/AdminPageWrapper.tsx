import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ReactNode } from "react";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { AdminLayout } from "./AdminLayout";
import { AdminViewId } from "./AdminLayout";
import { useAuth } from "../../contexts/AuthContext";

type AdminPageWrapperProps = {
  children: ReactNode;
  currentView: AdminViewId;
  pageTitle?: string;
  pageSubtitle?: string;
  // When set, a back arrow is shown above the content that routes here.
  backTo?: string;
  backLabel?: string;
};

export function AdminPageWrapper({ children, currentView, pageTitle, pageSubtitle, backTo, backLabel }: AdminPageWrapperProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const viewToToggleKey: Record<string, string> = {
    socialMediaMetrics: "socialMediaMetrics",
    businessUnits: "businessUnits",
    trainingExecutive: "trainingCenter",
    onlineTraining: "onlineTraining",
    userManagement: "userManagement",
    courseManagement: "courseManagement",
    appsTools: "appsTools",
    stormChat: "stormChat",
    courseAiBots: "courseAiBots",
    aiBots: "aiBots",
    messaging: "messaging",
    leaderboard: "leaderboard",
    emailConfig: "emailConfig",
    myTasks: "taskTracker",
  };

  useEffect(() => {
    if (!user?.id) return;
    const toggleKey = viewToToggleKey[currentView];
    if (!toggleKey) return;
    fetch(`/api/users/${user.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const toggles = data?.featureToggles;
        if (toggles && toggles[toggleKey] === false) {
          setAllowed(false);
          router.replace("/admin/user-management");
        } else {
          setAllowed(true);
        }
      })
      .catch(() => setAllowed(true));
  }, [user?.id, currentView]);

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <AdminLayout
        currentView={currentView}
        pageTitle={pageTitle}
        pageSubtitle={pageSubtitle}
        back={backTo ? (
          <button
            type="button"
            onClick={() => router.push(backTo)}
            title={backLabel || "Back to User Management"}
            aria-label={backLabel || "Back to User Management"}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              background: "var(--surface-default)", color: "var(--text-tertiary)", border: "1px solid var(--border-default)",
              borderRadius: 10, width: 40, height: 40, fontSize: 20, lineHeight: 1, cursor: "pointer",
            }}
          >
            ←
          </button>
        ) : undefined}
      >
        {allowed === false ? null : (backTo ? <div style={{ marginTop: 20 }}>{children}</div> : children)}
      </AdminLayout>
    </ProtectedRoute>
  );
}
