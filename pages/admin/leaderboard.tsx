// pages/admin/leaderboard.tsx
import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { LeaderboardBoard } from "../../src/components/LeaderboardBoard";
import { AcculynxSyncPanel } from "../../src/portals/admin/AcculynxSyncPanel";
import { useAuth } from "../../src/contexts/AuthContext";

const LeaderboardPage: NextPage = () => {
  const { user } = useAuth();
  return (
    <AdminPageWrapper currentView="leaderboard">
      <div style={{ padding: 24 }}>
        <h1 style={{ margin: "0 0 16px", fontSize: 24, fontWeight: 700 }}>Sales Leaderboard</h1>
        <LeaderboardBoard currentUserId={user?.id} />
        <AcculynxSyncPanel adminUserId={user?.id ?? ""} />
      </div>
    </AdminPageWrapper>
  );
};

export default LeaderboardPage;
