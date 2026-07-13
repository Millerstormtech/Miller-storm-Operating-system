import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { LeaderboardBoard } from "../../src/components/LeaderboardBoard";
import { useAuth } from "../../src/contexts/AuthContext";

const CLevelSalesLeaderboardPage: NextPage = () => {
  const { user } = useAuth();
  return (
    <CLevelLayout currentView="sales-leaderboard">
      <div style={{ padding: 24 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700 }}>Sales Leaderboard</h1>
        <p style={{ margin: "0 0 20px", color: "#6b7280" }}>Refreshed every 30 minutes</p>
        <LeaderboardBoard currentUserId={user?.id} />
      </div>
    </CLevelLayout>
  );
};

export default CLevelSalesLeaderboardPage;
