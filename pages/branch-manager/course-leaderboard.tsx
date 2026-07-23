import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { TrainingLeaderboard } from "../../src/portals/shared/training-leaderboard/TrainingLeaderboard";

const BranchManagerCourseLeaderboardPage: NextPage = () => {
  return (
    <BranchManagerLayout currentView="course-leaderboard">
      <TrainingLeaderboard />
    </BranchManagerLayout>
  );
};

export default BranchManagerCourseLeaderboardPage;
