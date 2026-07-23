import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { TrainingLeaderboard } from "../../src/portals/shared/training-leaderboard/TrainingLeaderboard";

const TrainingExecutivePage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="trainingExecutive">
      <TrainingLeaderboard />
    </AdminPageWrapper>
  );
};

export default TrainingExecutivePage;
