import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { ScoreboardHome } from "../../src/portals/shared/scoreboard/ScoreboardHome";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { useAuth } from "../../src/contexts/AuthContext";

const DashboardPage: NextPage = () => {
  const { user } = useAuth();

  // Session still resolving (AuthContext hasn't returned a user yet): show a
  // bare loading state, same as before. ProtectedRoute below only mounts once
  // a user exists, so this check has to stay outside it.
  if (!user) {
    return (
      <SalesLayout currentView="dashboard">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <div style={{ color: 'var(--text-muted)' }}>Checking session...</div>
          </div>
        </div>
      </SalesLayout>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["sales"]}>
      <SalesLayout currentView="dashboard" userName={user.name} userId={user.id}>
        <ScoreboardHome />
      </SalesLayout>
    </ProtectedRoute>
  );
};

export default DashboardPage;
