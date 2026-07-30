// pages/manager/rankings.tsx
import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { LeaderboardBoard } from "../../src/components/LeaderboardBoard";
import { useAuth } from "../../src/contexts/AuthContext";

const ManagerRankings: NextPage = () => {
  const { user } = useAuth();
  return (
    <ProtectedRoute allowedRoles={["sales-team-lead", "admin"]}>
      <SalesTeamLeadLayout currentView="rankings" pageSubtitle="Refreshed every 30 minutes">
        <div style={{ padding: 24 }}>
          <LeaderboardBoard currentUserId={user?.id} />
        </div>
      </SalesTeamLeadLayout>
    </ProtectedRoute>
  );
};

export default ManagerRankings;
