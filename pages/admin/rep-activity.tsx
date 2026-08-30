import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { ActivityReport } from "../../src/portals/admin/ActivityReport";

const RepActivityPage: NextPage = () => {
  return (
    <AdminPageWrapper
      currentView="repActivity"
      pageTitle="Rep Activity"
      pageSubtitle="Daily app usage — time on web vs mobile, time on training videos and quizzes, and which videos each rep watched."
    >
      <ActivityReport />
    </AdminPageWrapper>
  );
};

export default RepActivityPage;
