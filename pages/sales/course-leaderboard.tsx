import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { TrainingLeaderboard } from "../../src/portals/shared/training-leaderboard/TrainingLeaderboard";
import { useAuth } from "../../src/contexts/AuthContext";

const SalesCourseLeaderboardPage: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;
  return (
    <SalesLayout currentView="course-leaderboard" userName={user.name} userId={user.id}>
      {/* Role behavior (your-rank strip, no admin tools) comes from AuthContext
          inside the component; no readOnly prop anymore. */}
      <TrainingLeaderboard />
    </SalesLayout>
  );
};

export default SalesCourseLeaderboardPage;
