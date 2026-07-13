import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { RoleDashboard } from "../../src/portals/admin/RoleDashboard";

const BranchManagerDashboardPage: NextPage = () => (
  <AdminPageWrapper currentView="branchManagerDashboard">
    <RoleDashboard role="branch-manager" title="Branch Manager Dashboard" />
  </AdminPageWrapper>
);

export default BranchManagerDashboardPage;
