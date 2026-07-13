// pages/marketing/rankings.tsx
import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { LeaderboardBoard } from "../../src/components/LeaderboardBoard";
import { useAuth } from "../../src/contexts/AuthContext";

const MarketingRankings: NextPage = () => {
  const { user } = useAuth();
  return (
    <ProtectedRoute allowedRoles={["marketing", "admin"]}>
      <MarketingLayout currentView="rankings">
        <div style={{ padding: 24 }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700 }}>Sales Leaderboard</h1>
          <p style={{ margin: "0 0 20px", color: "#6b7280" }}>Refreshed every 30 minutes</p>
          <LeaderboardBoard currentUserId={user?.id} />
        </div>
      </MarketingLayout>
    </ProtectedRoute>
  );
};

export default MarketingRankings;
