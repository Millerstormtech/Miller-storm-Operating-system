import type { NextPage } from "next";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { TrainingLeaderboard } from "../../src/portals/shared/training-leaderboard/TrainingLeaderboard";

const SalesTeamLeadCourseLeaderboardPage: NextPage = () => {
  return (
    <SalesTeamLeadLayout currentView="course-leaderboard">
      <TrainingLeaderboard />
    </SalesTeamLeadLayout>
  );
};

export default SalesTeamLeadCourseLeaderboardPage;
