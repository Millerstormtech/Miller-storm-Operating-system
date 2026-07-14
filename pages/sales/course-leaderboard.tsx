import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { CourseLeaderboard } from "../../src/portals/admin/CourseLeaderboard";
import { useAuth } from "../../src/contexts/AuthContext";

const SalesCourseLeaderboardPage: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;
  return (
    <SalesLayout currentView="course-leaderboard" userName={user.name} userId={user.id}>
      {/* readOnly → sales reps see the rankings but none of the admin
          "hide users" controls. */}
      <CourseLeaderboard readOnly />
    </SalesLayout>
  );
};

export default SalesCourseLeaderboardPage;
