import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { TrainingLeaderboard } from "../../src/portals/shared/training-leaderboard/TrainingLeaderboard";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";

const MarketingCourseLeaderboardPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["marketing", "admin"]}>
      <MarketingLayout currentView="course-leaderboard">
        <TrainingLeaderboard />
      </MarketingLayout>
    </ProtectedRoute>
  );
};

export default MarketingCourseLeaderboardPage;
