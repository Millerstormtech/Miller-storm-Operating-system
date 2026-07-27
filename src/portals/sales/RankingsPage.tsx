// src/portals/sales/RankingsPage.tsx
import { LeaderboardBoard } from "../../components/LeaderboardBoard";

export function RankingsPage({ currentUserId }: { currentUserId?: string }) {
  return (
    <div className="rankings-page" style={{ padding: 24 }}>
      <LeaderboardBoard currentUserId={currentUserId} />
    </div>
  );
}
