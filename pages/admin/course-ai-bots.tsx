import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { CourseAiBotBuilder } from "../../src/portals/admin/CourseAiBotBuilder";

const CourseAiBotsPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="courseAiBots">
      <CourseAiBotBuilder />
    </AdminPageWrapper>
  );
};

export default CourseAiBotsPage;
