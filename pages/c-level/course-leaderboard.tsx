import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { TrainingLeaderboard } from "../../src/portals/shared/training-leaderboard/TrainingLeaderboard";

const CLevelCourseLeaderboardPage: NextPage = () => {
  return (
    <CLevelLayout currentView="course-leaderboard">
      <TrainingLeaderboard />
    </CLevelLayout>
  );
};

export default CLevelCourseLeaderboardPage;
