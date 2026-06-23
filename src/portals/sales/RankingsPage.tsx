// src/portals/sales/RankingsPage.tsx
import { LeaderboardBoard } from "../../components/LeaderboardBoard";

export function RankingsPage({ currentUserId }: { currentUserId?: string }) {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700 }}>Sales Rankings</h1>
      <p style={{ margin: "0 0 20px", color: "#6b7280" }}>Live from AccuLynx · refreshed hourly</p>
      <LeaderboardBoard currentUserId={currentUserId} />
    </div>
  );
}
