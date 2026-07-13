import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { RoleDashboard } from "../../src/portals/admin/RoleDashboard";

const SalesRepDashboardPage: NextPage = () => (
  <AdminPageWrapper currentView="salesRepDashboard">
    <RoleDashboard role="sales" title="Sales Rep Dashboard" />
  </AdminPageWrapper>
);

export default SalesRepDashboardPage;
