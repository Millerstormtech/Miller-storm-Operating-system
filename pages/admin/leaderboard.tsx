// pages/admin/leaderboard.tsx
import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { LeaderboardBoard } from "../../src/components/LeaderboardBoard";
import { AcculynxSyncPanel } from "../../src/portals/admin/AcculynxSyncPanel";
import { useAuth } from "../../src/contexts/AuthContext";

const LeaderboardPage: NextPage = () => {
  const { user } = useAuth();
  return (
    <AdminPageWrapper currentView="leaderboard" pageSubtitle="Refreshed every 30 minutes">
      <div style={{ padding: 24 }}>
        <LeaderboardBoard currentUserId={user?.id} />
        <AcculynxSyncPanel adminUserId={user?.id ?? ""} />
      </div>
    </AdminPageWrapper>
  );
};

export default LeaderboardPage;
