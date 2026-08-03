import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { MyTasks } from "../../src/portals/shared/MyTasks/MyTasks";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";

const MarketingMyTasksPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["marketing", "admin"]}>
      <MarketingLayout currentView="my-tasks">
        <MyTasks />
      </MarketingLayout>
    </ProtectedRoute>
  );
};

export default MarketingMyTasksPage;
