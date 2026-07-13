import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { CLevelDashboard } from "../../src/portals/admin/CLevelDashboard";

const CLevelDashboardPage: NextPage = () => (
  <AdminPageWrapper currentView="cLevelDashboard">
    <CLevelDashboard />
  </AdminPageWrapper>
);

export default CLevelDashboardPage;
