import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { ActivityReport } from "../../src/portals/admin/ActivityReport";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";

const CLevelRepActivityPage: NextPage = () => (
  <ProtectedRoute allowedRoles={["c-level"]}>
    <CLevelLayout
      currentView="rep-activity"
      pageTitle="Rep Activity"
      pageSubtitle="Daily app usage — time on web vs mobile, time on training videos and quizzes, and which videos each rep watched."
    >
      <ActivityReport />
    </CLevelLayout>
  </ProtectedRoute>
);

export default CLevelRepActivityPage;
