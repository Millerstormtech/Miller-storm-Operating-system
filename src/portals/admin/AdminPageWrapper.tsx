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
};

export function AdminPageWrapper({ children, currentView }: AdminPageWrapperProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const viewToToggleKey: Record<string, string> = {
    socialMediaMetrics: "socialMediaMetrics",
    businessUnits: "businessUnits",
    trainingExecutive: "trainingCenter",
    userManagement: "userManagement",
    courseManagement: "courseManagement",
    appsTools: "appsTools",
    stormChat: "stormChat",
    courseAiBots: "courseAiBots",
    aiBots: "aiBots",
    messaging: "messaging",
    leaderboard: "leaderboard",
    emailConfig: "emailConfig",
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
          router.replace("/admin/social-media-metrics");
        } else {
          setAllowed(true);
        }
      })
      .catch(() => setAllowed(true));
  }, [user?.id, currentView]);

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <AdminLayout currentView={currentView}>
        {allowed === false ? null : children}
      </AdminLayout>
    </ProtectedRoute>
  );
}
