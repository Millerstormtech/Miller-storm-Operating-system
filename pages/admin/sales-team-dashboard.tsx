import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { RoleDashboard } from "../../src/portals/admin/RoleDashboard";

const SalesTeamDashboardPage: NextPage = () => (
  <AdminPageWrapper currentView="salesTeamDashboard">
    <RoleDashboard role="sales-team-lead" title="Sales Team Dashboard" />
  </AdminPageWrapper>
);

export default SalesTeamDashboardPage;
