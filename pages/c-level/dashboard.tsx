import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { ScoreboardHome } from "../../src/portals/shared/scoreboard/ScoreboardHome";
import { PodiumStrip } from "../../src/portals/shared/scoreboard/PodiumStrip";
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
        {/* The podiums are C-level only. Passing them as a footer keeps the
            shared ScoreboardHome free of role checks, and keeps a COMPANY-wide
            top three off the branch-manager and team-lead boards, where the
            tiles above it are branch and team scoped. */}
        <ScoreboardHome renderFooter={(window) => <PodiumStrip window={window} />} />
      </CLevelLayout>
    </ProtectedRoute>
  );
};

export default CLevelDashboardPage;
