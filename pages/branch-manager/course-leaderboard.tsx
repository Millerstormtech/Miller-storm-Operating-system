import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { CourseLeaderboard } from "../../src/portals/admin/CourseLeaderboard";

const BranchManagerCourseLeaderboardPage: NextPage = () => {
  return (
    <BranchManagerLayout currentView="course-leaderboard">
      <CourseLeaderboard />
    </BranchManagerLayout>
  );
};

export default BranchManagerCourseLeaderboardPage;
