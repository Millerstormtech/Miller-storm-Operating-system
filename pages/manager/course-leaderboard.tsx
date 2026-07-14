import type { NextPage } from "next";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { CourseLeaderboard } from "../../src/portals/admin/CourseLeaderboard";

const SalesTeamLeadCourseLeaderboardPage: NextPage = () => {
  return (
    <SalesTeamLeadLayout currentView="course-leaderboard">
      <CourseLeaderboard />
    </SalesTeamLeadLayout>
  );
};

export default SalesTeamLeadCourseLeaderboardPage;
