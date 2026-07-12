import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { CourseLeaderboard } from "../../src/portals/admin/CourseLeaderboard";

const CLevelCourseLeaderboardPage: NextPage = () => {
  return (
    <CLevelLayout currentView="course-leaderboard">
      <CourseLeaderboard />
    </CLevelLayout>
  );
};

export default CLevelCourseLeaderboardPage;
