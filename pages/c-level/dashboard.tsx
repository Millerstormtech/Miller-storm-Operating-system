import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { CLevelDashboard } from "../../src/portals/c-level/CLevelDashboard";

const CLevelDashboardPage: NextPage = () => {
  return (
    <CLevelLayout currentView="dashboard">
      <CLevelDashboard />
    </CLevelLayout>
  );
};

export default CLevelDashboardPage;
