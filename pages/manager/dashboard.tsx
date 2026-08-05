import type { NextPage } from "next";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
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
      <SalesTeamLeadLayout currentView="dashboard">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <div style={{ color: '#6b7280' }}>Checking session...</div>
          </div>
        </div>
      </SalesTeamLeadLayout>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["sales-team-lead"]}>
      <SalesTeamLeadLayout currentView="dashboard">
        <ScoreboardHome />
      </SalesTeamLeadLayout>
    </ProtectedRoute>
  );
};

export default DashboardPage;
