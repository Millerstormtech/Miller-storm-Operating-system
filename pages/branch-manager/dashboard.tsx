import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { BranchManagerDashboard } from "../../src/portals/branch-manager/BranchManagerDashboard";

const BranchManagerDashboardPage: NextPage = () => {
  return (
    <BranchManagerLayout currentView="dashboard">
      <BranchManagerDashboard />
    </BranchManagerLayout>
  );
};

export default BranchManagerDashboardPage;
