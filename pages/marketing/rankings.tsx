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
      <MarketingLayout currentView="rankings" pageSubtitle="Refreshed every 30 minutes">
        <div style={{ padding: 24 }}>
          <LeaderboardBoard currentUserId={user?.id} />
        </div>
      </MarketingLayout>
    </ProtectedRoute>
  );
};

export default MarketingRankings;
