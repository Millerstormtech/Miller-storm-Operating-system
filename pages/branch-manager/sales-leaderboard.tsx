import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { LeaderboardBoard } from "../../src/components/LeaderboardBoard";
import { useAuth } from "../../src/contexts/AuthContext";

const BranchManagerSalesLeaderboardPage: NextPage = () => {
  const { user } = useAuth();
  return (
    <BranchManagerLayout currentView="sales-leaderboard">
      <div style={{ padding: 24 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700 }}>Sales Leaderboard</h1>
        <p style={{ margin: "0 0 20px", color: "#6b7280" }}>Live from AccuLynx + RepCard · refreshed hourly</p>
        <LeaderboardBoard currentUserId={user?.id} />
      </div>
    </BranchManagerLayout>
  );
};

export default BranchManagerSalesLeaderboardPage;
