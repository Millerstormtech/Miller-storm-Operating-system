import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { RoleDashboard } from "../../src/portals/shared/dashboard/RoleDashboard";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { useAuth } from "../../src/contexts/AuthContext";

const CLevelDashboardPage: NextPage = () => {
  const { user } = useAuth();

  // Session still resolving (AuthContext hasn't returned a user yet): show a
  // bare loading state, same as before. ProtectedRoute below only mounts once
  // a user exists, so this check has to stay outside it.
  if (!user) {
    return (
      <CLevelLayout currentView="dashboard">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <div style={{ color: 'var(--text-muted)' }}>Checking session...</div>
          </div>
        </div>
      </CLevelLayout>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["c-level"]}>
      <CLevelLayout currentView="dashboard">
        {/* RoleDashboard scopes itself from the session on the server, so the
            same component serves all four sales roles. The top three, the
            branch breakdown and the news feed are decided by scope inside
            /api/dashboard, never by a prop passed from here. */}
        <RoleDashboard />
      </CLevelLayout>
    </ProtectedRoute>
  );
};

export default CLevelDashboardPage;
