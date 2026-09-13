import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { ActivityReport } from "../../src/portals/admin/ActivityReport";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";

const BranchManagerRepActivityPage: NextPage = () => (
  <ProtectedRoute allowedRoles={["branch-manager"]}>
    <BranchManagerLayout
      currentView="rep-activity"
      pageTitle="Rep Activity"
      pageSubtitle="Daily app usage — time on web vs mobile, time on training videos and quizzes, and which videos each rep watched."
    >
      <ActivityReport />
    </BranchManagerLayout>
  </ProtectedRoute>
);

export default BranchManagerRepActivityPage;
