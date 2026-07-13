import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { BranchManagerDashboard } from "../../src/portals/admin/BranchManagerDashboard";

const BranchManagerDashboardPage: NextPage = () => (
  <AdminPageWrapper currentView="branchManagerDashboard">
    <BranchManagerDashboard />
  </AdminPageWrapper>
);

export default BranchManagerDashboardPage;
