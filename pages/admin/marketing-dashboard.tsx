import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { RoleDashboard } from "../../src/portals/admin/RoleDashboard";

const MarketingDashboardPage: NextPage = () => (
  <AdminPageWrapper currentView="marketingDashboard">
    <RoleDashboard role="marketing" title="Marketing Dashboard" />
  </AdminPageWrapper>
);

export default MarketingDashboardPage;
