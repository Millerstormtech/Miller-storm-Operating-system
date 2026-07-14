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
      <SalesTeamLeadLayout currentView="rankings">
        <div style={{ padding: 24 }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700 }}>Sales Leaderboard</h1>
          <p style={{ margin: "0 0 20px", color: "#6b7280" }}>Refreshed every 30 minutes</p>
          <LeaderboardBoard currentUserId={user?.id} />
        </div>
      </SalesTeamLeadLayout>
    </ProtectedRoute>
  );
};

export default ManagerRankings;
