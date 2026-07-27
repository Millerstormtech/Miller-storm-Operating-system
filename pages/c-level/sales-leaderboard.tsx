import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { LeaderboardBoard } from "../../src/components/LeaderboardBoard";
import { useAuth } from "../../src/contexts/AuthContext";

const CLevelSalesLeaderboardPage: NextPage = () => {
  const { user } = useAuth();
  return (
    <CLevelLayout currentView="sales-leaderboard" pageSubtitle="Refreshed every 30 minutes">
      <div style={{ padding: 24 }}>
        <LeaderboardBoard currentUserId={user?.id} />
      </div>
    </CLevelLayout>
  );
};

export default CLevelSalesLeaderboardPage;
