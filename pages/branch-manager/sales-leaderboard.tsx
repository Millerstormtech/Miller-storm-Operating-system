import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { LeaderboardBoard } from "../../src/components/LeaderboardBoard";
import { useAuth } from "../../src/contexts/AuthContext";

const BranchManagerSalesLeaderboardPage: NextPage = () => {
  const { user } = useAuth();
  return (
    <BranchManagerLayout currentView="sales-leaderboard" pageSubtitle="Refreshed every 30 minutes">
      <div style={{ padding: 24 }}>
        <LeaderboardBoard currentUserId={user?.id} />
      </div>
    </BranchManagerLayout>
  );
};

export default BranchManagerSalesLeaderboardPage;
