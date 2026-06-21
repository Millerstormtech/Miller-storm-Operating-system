import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { CourseLeaderboard } from "../../src/portals/admin/CourseLeaderboard";

const TrainingExecutivePage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="trainingExecutive">
      <CourseLeaderboard />
    </AdminPageWrapper>
  );
};

export default TrainingExecutivePage;
